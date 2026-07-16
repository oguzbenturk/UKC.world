import Decimal from 'decimal.js';
import {
  recordLegacyTransaction,
  recordTransaction as recordWalletTransaction,
  getWalletAccountSummary
} from './walletService.js';
import { logger } from '../middlewares/errorHandler.js';
import { recomputeDiscountForCustomerPackage, deleteDiscount } from './discountService.js';
import { recomputeManagerCommissionsForPackage } from './managerCommissionService.js';
import BookingUpdateCascadeService from './bookingUpdateCascadeService.js';
import CurrencyService from './currencyService.js';
import {
  TRANSACTION_TYPE,
  WALLET_ENTITY_TYPE,
  WALLET_TX_STATUS,
  PAYMENT_METHOD,
  TX_DIRECTION,
} from '../constants/transactions.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function normalizePackageRow(row) {
  if (!row) {
    return null;
  }

  const toNumber = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      const d = new Decimal(value);
      return d.toNumber();
    } catch {
      return null;
    }
  };

  const totalHours = toNumber(row.total_hours) || 0;
  const usedHours = toNumber(row.used_hours) || 0;
  const remainingHours = toNumber(row.remaining_hours) || 0;
  const purchasePrice = toNumber(row.purchase_price) || 0;
  // NULL means the price has never been edited; keep null so callers can
  // distinguish "never edited" from "edited back to original".
  const originalPrice = row.original_price !== undefined && row.original_price !== null
    ? toNumber(row.original_price)
    : null;
  const pricePerHour = totalHours > 0 ? purchasePrice / totalHours : 0;
  const usageSummary = {
    totalHours,
    usedHours,
    remainingHours,
    purchasePrice,
    pricePerHour,
    usedAmount: usedHours * pricePerHour,
    remainingAmount: remainingHours * pricePerHour
  };

  return {
    id: row.id,
    customerId: row.customer_id,
    servicePackageId: row.service_package_id,
    packageName: row.package_name,
    lessonServiceName: row.lesson_service_name,
    totalHours,
    usedHours,
    remainingHours,
    purchasePrice,
    originalPrice,
    currency: row.currency || 'EUR',
    purchaseDate: row.purchase_date,
    expiryDate: row.expiry_date,
    status: row.status,
    notes: row.notes,
    lastUsedDate: row.last_used_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pricePerHour,
    usageSummary
  };
}

export async function fetchCustomerPackagesByIds(client, packageIds = []) {
  if (!client || !Array.isArray(packageIds) || packageIds.length === 0) {
    return [];
  }

  const { rows } = await client.query(
    `SELECT id, customer_id, service_package_id, package_name, lesson_service_name, total_hours, used_hours, remaining_hours, purchase_price, original_price, currency, purchase_date, expiry_date, status, notes, last_used_date, created_at, updated_at FROM customer_packages WHERE id = ANY($1)`,
    [packageIds]
  );

  return rows.map(normalizePackageRow);
}

export async function forceDeleteCustomerPackage({
  client,
  packageId,
  actorId = null,
  issueRefund = true,
  forceFullRefund = false,
  expectedCustomerId = null,
  includeWalletSummary = true,
  usageSettlement = null
}) {
  if (!client) {
    throw new Error('Database client is required to delete customer package');
  }

  const packageResult = await client.query(
    'SELECT id, customer_id, service_package_id, package_name, lesson_service_name, total_hours, used_hours, remaining_hours, purchase_price, original_price, currency, purchase_date, expiry_date, status, notes, last_used_date, created_at, updated_at, check_in_date, check_out_date FROM customer_packages WHERE id = $1 FOR UPDATE',
    [packageId]
  );

  if (packageResult.rows.length === 0) {
    const error = new Error('Customer package not found');
    error.statusCode = 404;
    throw error;
  }

  const customerPackage = packageResult.rows[0];

  // CRITICAL: Check if package was actually paid (has a completed wallet transaction)
  // If pay_later or never paid, don't issue refund - there's nothing to refund
  let wasActuallyPaid = false;
  if (issueRefund) {
    const paymentCheck = await client.query(
      `SELECT id FROM wallet_transactions 
       WHERE related_entity_id = $1 
         AND related_entity_type = 'customer_package'
         AND transaction_type = 'package_purchase'
         AND status = 'completed'
         AND amount < 0
       LIMIT 1`,
      [packageId]
    );
    wasActuallyPaid = paymentCheck.rows.length > 0;
    
    // Also check notes for pay_later indication
    if (!wasActuallyPaid && customerPackage.notes?.toLowerCase()?.includes('pay later')) {
      logger.info('Package was purchased with pay_later - skipping refund', { packageId });
    }
    
    // Override issueRefund if package was never actually paid
    if (!wasActuallyPaid) {
      logger.info('No payment transaction found for package - skipping refund', { packageId });
      issueRefund = false;
    }
  }

  if (expectedCustomerId && customerPackage.customer_id !== expectedCustomerId) {
    const error = new Error('Package does not belong to the transaction user');
    error.statusCode = 400;
    throw error;
  }

  const cleanup = {
    participantReferencesCleared: 0,
    bookingReferencesCleared: 0,
    accommodationBookingsCancelled: 0,
  };

  // Look up the service hourly rate BEFORE clearing references (needed for refund calculation)
  let serviceHourlyRate = null;
  const completedUsedHours = Number.parseFloat(customerPackage.used_hours) || 0;
  if (completedUsedHours > 0) {
    try {
      const svcRateResult = await client.query(`
        SELECT DISTINCT s.price AS service_price, s.duration AS service_duration
        FROM booking_participants bp
        JOIN bookings b ON b.id = bp.booking_id
        JOIN services s ON s.id = b.service_id
        WHERE bp.customer_package_id = $1
          AND b.status = 'completed'
          AND b.deleted_at IS NULL
        LIMIT 1
      `, [packageId]);

      if (svcRateResult.rows.length > 0) {
        const svcPrice = new Decimal(svcRateResult.rows[0].service_price || 0);
        const svcDuration = new Decimal(svcRateResult.rows[0].service_duration || 1);
        if (svcPrice.gt(0) && svcDuration.gt(0)) {
          serviceHourlyRate = svcPrice.div(svcDuration).toNumber();
        }
      }
    } catch (rateErr) {
      logger.warn('Failed to look up service hourly rate for package deletion', {
        packageId, error: rateErr.message
      });
    }
  }

  // Reverse any open discount adjustments on this package and remove the
  // discount rows. Without this, the refund below would return the full
  // purchase_price while the original discount credit stays on the wallet —
  // double-counting the discount and leaving a phantom balance the customer
  // never paid for.
  const { rows: pkgDiscounts } = await client.query(
    `SELECT id FROM discounts WHERE entity_type = 'customer_package' AND entity_id = $1`,
    [String(packageId)]
  );
  for (const d of pkgDiscounts) {
    await deleteDiscount(client, d.id, { createdBy: actorId });
  }

  const { rows: participantUpdates } = await client.query(
    `UPDATE booking_participants
        SET customer_package_id = NULL
      WHERE customer_package_id = $1
      RETURNING id, booking_id`,
    [packageId]
  );

  cleanup.participantReferencesCleared = participantUpdates.length;

  const { rows: bookingUpdates } = await client.query(
    `UPDATE bookings
        SET customer_package_id = NULL
      WHERE customer_package_id = $1
      RETURNING id`,
    [packageId]
  );

  cleanup.bookingReferencesCleared = bookingUpdates.length;

  // Remove the package's FIFO consumption ledger rows (migration 278). Even
  // fully RELEASED rows survive here — their booking_id CASCADE never fires
  // because bookings are soft-deleted — and the FK on customer_package_id
  // blocked the DELETE below with an opaque 500 (undeletable package). The
  // rows are meaningless once the package is gone; migration 288 also makes
  // the FK ON DELETE CASCADE as a structural backstop.
  const { rowCount: consumptionRowsRemoved } = await client.query(
    'DELETE FROM booking_package_consumption WHERE customer_package_id = $1',
    [packageId]
  );
  cleanup.consumptionRowsRemoved = consumptionRowsRemoved;

  // Cancel any accommodation booking created for this package.
  // The booking is identified by the notes field set at purchase time.
  // Also match by guest_id + date range as a secondary safeguard.
  const accomNotePattern = `%Customer Package ID: ${packageId}%`;
  const { rows: accomUpdates } = await client.query(
    `UPDATE accommodation_bookings
        SET status = 'cancelled', updated_at = NOW()
      WHERE guest_id = $1
        AND status != 'cancelled'
        AND (
          notes LIKE $2
          OR (
            check_in_date = $3
            AND check_out_date = $4
          )
        )
      RETURNING id`,
    [
      customerPackage.customer_id,
      accomNotePattern,
      customerPackage.check_in_date || null,
      customerPackage.check_out_date || null,
    ]
  );
  cleanup.accommodationBookingsCancelled = accomUpdates.length;
  if (accomUpdates.length > 0) {
    logger.info('Cancelled accommodation booking(s) linked to deleted package', {
      packageId, accommodationBookingIds: accomUpdates.map(r => r.id)
    });
  }

  const { rows: deletedRows } = await client.query(
    'DELETE FROM customer_packages WHERE id = $1 RETURNING *',
    [packageId]
  );

  const deletedPackage = deletedRows[0];

  const totalHours = new Decimal(deletedPackage.total_hours || 0);
  const usedHours = new Decimal(deletedPackage.used_hours || 0);
  const remainingHours = new Decimal(deletedPackage.remaining_hours || 0);
  const purchasePrice = new Decimal(deletedPackage.purchase_price || 0);
  const pricePerHour = totalHours.gt(0) ? purchasePrice.div(totalHours) : new Decimal(0);

  // When there are completed bookings, use the service's hourly rate to calculate
  // the cost of consumed lessons. This ensures fair billing at the per-lesson rate
  // rather than the discounted package rate.
  const effectiveRate = (usedHours.gt(0) && serviceHourlyRate) ? new Decimal(serviceHourlyRate) : pricePerHour;
  const usedAmount = usedHours.mul(effectiveRate);

  // forceFullRefund: admin explicitly refunds full purchase price regardless of remaining hours
  const partialRefundAmount = forceFullRefund && issueRefund
    ? purchasePrice
    : Decimal.max(new Decimal(0), purchasePrice.sub(usedAmount));

  // Resolve refund currency: use the package's stored currency, or fall back to user's preferred currency
  let refundCurrency = deletedPackage.currency;
  if (!refundCurrency) {
    const userPrefRow = await client.query('SELECT preferred_currency FROM users WHERE id = $1', [deletedPackage.customer_id]);
    refundCurrency = userPrefRow.rows[0]?.preferred_currency || 'EUR';
  }

  let walletTransaction = null;
  let walletSummary = null;
  let usageSettlementTransaction = null;

  if (issueRefund && partialRefundAmount.gt(0)) {
    try {
      walletTransaction = await recordLegacyTransaction({
        client,
        userId: deletedPackage.customer_id,
        amount: partialRefundAmount.toDecimalPlaces(2).toNumber(),
        transactionType: 'package_refund',
        status: WALLET_TX_STATUS.COMPLETED,
        direction: TX_DIRECTION.CREDIT,
        description: `Package Partial Refund: ${deletedPackage.package_name} (${remainingHours.toNumber()}h/${totalHours.toNumber()}h unused)`,
        currency: refundCurrency,
        paymentMethod: 'package_refund',
        referenceNumber: deletedPackage.id,
        metadata: {
          packageId: deletedPackage.id,
          packageName: deletedPackage.package_name,
          totalHours: totalHours.toNumber(),
          usedHours: usedHours.toNumber(),
          remainingHours: remainingHours.toNumber(),
          pricePerHour: pricePerHour.toNumber(),
          source: issueRefund ? 'services:customer-packages:force-delete' : 'finances:transaction-cascade'
        },
        entityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityId: deletedPackage.id,
        createdBy: actorId || null
      });
    } catch (walletError) {
      logger.error('Failed to record package refund transaction', {
        packageId,
        customerId: deletedPackage.customer_id,
        error: walletError?.message
      });
      throw walletError;
    }
  } else if (!issueRefund && partialRefundAmount > 0) {
    logger.info('Skipping automatic package refund because refund handled by parent operation', {
      packageId,
      partialRefundAmount: partialRefundAmount.toFixed(2)
    });
  }

  if (usageSettlement?.mode === 'charge-used' && usedAmount > 0) {
    const settlementAmount = Number.isFinite(usageSettlement?.chargeAmount)
      ? Math.abs(Number(usageSettlement.chargeAmount))
      : Math.abs(usedAmount);
    const settlementDebitAmount = settlementAmount > 0 ? -settlementAmount : 0;

    if (settlementDebitAmount < 0) {
      try {
        usageSettlementTransaction = await recordWalletTransaction({
          client,
          userId: deletedPackage.customer_id,
          amount: settlementDebitAmount,
          availableDelta: settlementDebitAmount,
          transactionType: 'package_usage_settlement',
          status: WALLET_TX_STATUS.COMPLETED,
          direction: TX_DIRECTION.DEBIT,
          description: `Charge for used hours from package ${deletedPackage.package_name}`,
          currency: refundCurrency,
          paymentMethod: 'package_usage_settlement',
          referenceNumber: deletedPackage.id,
          metadata: {
            packageId: deletedPackage.id,
            packageName: deletedPackage.package_name,
            totalHours,
            usedHours,
            remainingHours,
            pricePerHour,
            settlementAmount,
            source: 'finances:transaction-cascade',
            requestedBy: usageSettlement?.requestedBy || actorId || null
          },
          entityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
          relatedEntityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
          relatedEntityId: deletedPackage.id,
          createdBy: actorId || null,
          allowNegative: usageSettlement?.allowNegative !== false
        });
      } catch (walletError) {
        logger.error('Failed to record package usage settlement', {
          packageId,
          customerId: deletedPackage.customer_id,
          error: walletError?.message
        });
        throw walletError;
      }
    }
  }

  if (includeWalletSummary) {
    try {
      walletSummary = await getWalletAccountSummary(deletedPackage.customer_id);
    } catch (summaryError) {
      logger.debug?.('Failed to load wallet summary after package deletion', {
        customerId: deletedPackage.customer_id,
        error: summaryError.message
      });
    }
  }

  return {
    package: normalizePackageRow(deletedPackage),
    cleanup,
    refundDetails: {
      totalHours,
      usedHours,
      remainingHours,
      originalPrice: purchasePrice,
      refundAmount: issueRefund ? partialRefundAmount : 0,
      calculatedRefundAmount: partialRefundAmount,
      refundIssued: issueRefund && partialRefundAmount > 0
    },
    usageSummary: {
      totalHours,
      usedHours,
      remainingHours,
      pricePerHour,
      purchasePrice,
      usedAmount,
      remainingAmount: partialRefundAmount
    },
    walletTransaction,
    usageSettlementTransaction,
    walletSummary
  };
}

// Edits a customer package's purchase_price after the fact (admin-only flow).
//
// Cascade:
//   1) UPDATE customer_packages.purchase_price (preserving original_price on
//      the very first edit).
//   2) If the package was actually paid (completed wallet package_purchase
//      transaction exists) and settleWallet=true, post a wallet credit
//      (price decreased) or debit (price increased) for the delta.
//   3) Recompute any layered % discount on this package against the new base.
//   4) Recompute pending manager commissions for the package's bookings;
//      already-paid-out commissions are left untouched.
//
// Instructor earnings recompute live on each query from purchase_price, so
// no cascade is needed for them. The caller is responsible for transaction
// boundaries (BEGIN/COMMIT) — we operate inside `client`.
export async function updateCustomerPackagePrice({
  client,
  packageId,
  newPrice,
  reason,
  settleWallet = true,
  actorId = null
}) {
  if (!client) throw new Error('Database client is required');
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw httpError(400, 'new_price must be a non-negative number');
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    throw httpError(400, 'reason is required');
  }
  if (trimmedReason.length > 500) {
    throw httpError(400, 'reason exceeds 500 characters');
  }

  const pkgRes = await client.query(
    `SELECT id, customer_id, purchase_price, original_price, currency, status, package_name,
            EXISTS (
              SELECT 1 FROM wallet_transactions
               WHERE related_entity_id = customer_packages.id
                 AND related_entity_type = 'customer_package'
                 AND transaction_type = 'package_purchase'
                 AND status = 'completed'
                 AND amount < 0
            ) AS was_actually_paid
       FROM customer_packages
      WHERE id = $1
      FOR UPDATE`,
    [packageId]
  );
  if (!pkgRes.rows.length) {
    throw httpError(404, 'Customer package not found');
  }
  const pkg = pkgRes.rows[0];
  if (pkg.status === 'cancelled') {
    throw httpError(400, 'Cannot edit price of a cancelled package');
  }

  const oldPrice = Number(pkg.purchase_price) || 0;
  const newPriceRounded = Number(new Decimal(newPrice).toDecimalPlaces(2).toString());
  const delta = Number(new Decimal(newPriceRounded).sub(oldPrice).toDecimalPlaces(2).toString());
  const currency = pkg.currency || 'EUR';

  // Preserve the very first agreed price on the first edit. Subsequent
  // edits leave original_price untouched.
  const newOriginalPrice = pkg.original_price !== null && pkg.original_price !== undefined
    ? pkg.original_price
    : oldPrice;

  const updated = await client.query(
    `UPDATE customer_packages
        SET purchase_price = $1,
            original_price = $2,
            updated_at = NOW()
      WHERE id = $3
  RETURNING *`,
    [newPriceRounded, newOriginalPrice, packageId]
  );

  // Wallet settlement — only if delta is non-zero AND the package was
  // actually paid (a completed package_purchase debit exists in the ledger).
  let walletAdjustment = null;
  if (settleWallet && Math.abs(delta) >= 0.005) {
    if (pkg.was_actually_paid) {
      const isCredit = delta < 0; // price went down -> refund the customer
      const absAmount = Math.abs(delta);
      walletAdjustment = await recordWalletTransaction({
        client,
        userId: pkg.customer_id,
        amount: isCredit ? absAmount : -absAmount,
        availableDelta: isCredit ? absAmount : -absAmount,
        transactionType: TRANSACTION_TYPE.PACKAGE_PRICE_ADJUSTMENT,
        status: WALLET_TX_STATUS.COMPLETED,
        direction: isCredit ? TX_DIRECTION.CREDIT : TX_DIRECTION.DEBIT,
        currency,
        description: isCredit
          ? `Package price reduced (${pkg.package_name}): ${trimmedReason}`
          : `Package price increased (${pkg.package_name}): ${trimmedReason}`,
        paymentMethod: PAYMENT_METHOD.PACKAGE_PRICE_ADJUSTMENT,
        referenceNumber: packageId,
        metadata: {
          packageId,
          packageName: pkg.package_name,
          oldPrice,
          newPrice: newPriceRounded,
          delta,
          reason: trimmedReason,
          actorId
        },
        entityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityId: packageId,
        createdBy: actorId,
        // Refunds must always be allowed even if the wallet is already
        // negative; debits also bypass the negative-balance guard because
        // this is an admin reconciliation, not a user purchase.
        allowNegative: true
      });
    } else {
      logger.info('Package was not paid — skipping wallet adjustment for price edit', { packageId });
    }
  }

  // Rebase any layered % discount against the new base price.
  const discountResult = await recomputeDiscountForCustomerPackage(client, {
    packageId,
    newBasePrice: newPriceRounded,
    currency,
    createdBy: actorId
  });

  // Recompute pending manager commissions tied to bookings that consumed this package.
  const commissionResult = await recomputeManagerCommissionsForPackage(client, packageId);

  // Refresh the per-lesson instructor_earnings snapshot for every completed
  // booking from this package. Percentage-rate instructors see updated
  // total_earnings; fixed-rate instructors are recomputed too but their
  // earnings stay the same since they're driven by duration not lesson amount.
  const earningsResult = await BookingUpdateCascadeService.recomputeEarningsForPackageBookings(client, packageId);

  logger.info('Customer package price edited', {
    packageId,
    oldPrice,
    newPrice: newPriceRounded,
    delta,
    discountAdjusted: discountResult.adjusted,
    commissionsUpdated: commissionResult.updated,
    commissionsSkippedPaidOut: commissionResult.skippedPaidOut,
    instructorEarningsUpdated: earningsResult.updated,
    actorId
  });

  return {
    package: normalizePackageRow(updated.rows[0]),
    oldPrice,
    newPrice: newPriceRounded,
    delta,
    walletAdjustment,
    discount: discountResult,
    commissions: commissionResult,
    instructorEarnings: earningsResult
  };
}

// Upgrades a customer package to a bigger/better TIER (a different
// service_package), then RE-PRICES every already-completed lesson that drew from
// it to the new tier's effective per-hour rate.
//
// This is the one sanctioned exception to the frozen-rate rule (migration 278):
// it overwrites booking_package_consumption.rate_per_hour for all active draws,
// preserving the first frozen rate in original_rate_per_hour (migration 279).
//
// Cascade (all inside the caller's transaction):
//   1) Swap service_package_id + purchase_price + total/remaining hours (used
//      hours preserved). original_price preserved on first edit.
//   2) Settle the price delta on the wallet (only if the package was paid).
//   3) Re-price the consumption ledger to the new effective per-hour rate.
//   4) Rebase any layered % discount against the new base.
//   5) Recompute manager commissions + instructor earnings + each booking's
//      final_amount from the re-priced ledger (payroll-settled rows are left
//      immutable; the live instructor-earnings view derives from the current
//      package price so it reflects the new tier regardless).
//
// dryRun: when true the caller ROLLs the transaction back — the returned summary
// (including per-lesson old→new amounts and the wallet delta) is identical to a
// real run, so it powers the upgrade-preview UI.
export async function upgradeCustomerPackage({
  client,
  packageId,
  newServicePackageId,
  reason,
  settleWallet = true,
  actorId = null,
  dryRun = false,
}) {
  if (!client) throw new Error('Database client is required');
  if (!newServicePackageId) throw httpError(400, 'newServicePackageId is required');
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) throw httpError(400, 'reason is required');
  if (trimmedReason.length > 500) throw httpError(400, 'reason exceeds 500 characters');

  const pkgRes = await client.query(
    `SELECT cp.*,
            EXISTS (
              SELECT 1 FROM wallet_transactions
               WHERE related_entity_id = cp.id
                 AND related_entity_type = 'customer_package'
                 AND transaction_type = 'package_purchase'
                 AND status = 'completed'
                 AND amount < 0
            ) AS was_actually_paid
       FROM customer_packages cp
      WHERE cp.id = $1
      FOR UPDATE`,
    [packageId]
  );
  if (!pkgRes.rows.length) throw httpError(404, 'Customer package not found');
  const pkg = pkgRes.rows[0];
  if (pkg.status === 'cancelled') throw httpError(400, 'Cannot upgrade a cancelled package');

  const tierRes = await client.query(
    `SELECT id, name, price, currency, total_hours, sessions_count, package_type,
            lesson_service_id, lesson_service_name, discipline_tag, lesson_category_tag,
            level_tag, includes_lessons, package_hourly_rate
       FROM service_packages WHERE id = $1`,
    [newServicePackageId]
  );
  if (!tierRes.rows.length) throw httpError(404, 'Target package tier not found');
  const tier = tierRes.rows[0];
  if (tier.includes_lessons === false) {
    throw httpError(400, 'Target tier is not a lesson package');
  }
  if (String(tier.id) === String(pkg.service_package_id)) {
    throw httpError(400, 'Target tier is the same as the current package');
  }

  const pkgCurrency = pkg.currency || 'EUR';
  const tierCurrency = tier.currency || 'EUR';
  // Convert the catalog tier price into the package's own currency so the wallet
  // delta and stored purchase_price stay in a single currency.
  let newPriceNative = Number(tier.price) || 0;
  if (tierCurrency !== pkgCurrency) {
    try {
      newPriceNative = await CurrencyService.convertCurrency(newPriceNative, tierCurrency, pkgCurrency, client);
    } catch (convErr) {
      logger.warn('Tier price currency conversion failed during upgrade; using raw catalog price', {
        packageId, tierCurrency, pkgCurrency, error: convErr.message,
      });
    }
  }
  newPriceNative = Number(new Decimal(newPriceNative).toDecimalPlaces(2).toString());

  const oldPrice = Number(pkg.purchase_price) || 0;
  const oldTotalHours = Number(pkg.total_hours) || 0;
  const usedHours = Number(pkg.used_hours) || 0;
  const newTotalHours = Number(tier.total_hours) || oldTotalHours;
  if (newTotalHours < usedHours - 0.0001) {
    throw httpError(400,
      `Target tier provides ${newTotalHours}h but the customer has already used ${usedHours}h. Choose a larger tier.`);
  }
  const newRemaining = Math.max(0, Number(new Decimal(newTotalHours).sub(usedHours).toDecimalPlaces(2).toString()));
  const delta = Number(new Decimal(newPriceNative).sub(oldPrice).toDecimalPlaces(2).toString());

  const newOriginalPrice = pkg.original_price !== null && pkg.original_price !== undefined
    ? pkg.original_price
    : oldPrice;

  // Snapshot the lessons on this package BEFORE re-pricing (for the drill-down).
  const beforeRes = await client.query(
    `SELECT b.id, b.date, b.status, b.payment_status, b.final_amount, b.duration,
            ie.payroll_id,
            COALESCE((SELECT SUM(hours_used) FROM booking_package_consumption
                       WHERE booking_id = b.id AND customer_package_id = $1 AND released_at IS NULL), 0) AS pkg_hours,
            COALESCE((SELECT SUM(hours_used * COALESCE(rate_per_hour, 0)) FROM booking_package_consumption
                       WHERE booking_id = b.id AND customer_package_id = $1 AND released_at IS NULL), 0) AS pkg_value
       FROM bookings b
       LEFT JOIN instructor_earnings ie ON ie.booking_id = b.id
      WHERE b.customer_package_id = $1
        AND b.deleted_at IS NULL`,
    [packageId]
  );
  const beforeMap = new Map(beforeRes.rows.map((r) => [r.id, r]));

  // The package's effective per-hour rate BEFORE any change (discount/combo
  // aware). Used to value legacy (no-ledger) bookings whose stored final_amount
  // is 0 because the package value was always computed on the fly.
  const oldEffectiveRate = await BookingUpdateCascadeService.computeEffectivePackageHourlyRate(client, packageId);

  // 1) Apply the tier swap.
  const updated = await client.query(
    `UPDATE customer_packages
        SET service_package_id = $1,
            package_name = $2,
            lesson_service_name = COALESCE($3, lesson_service_name),
            total_hours = $4,
            remaining_hours = $5,
            purchase_price = $6,
            original_price = $7,
            status = CASE WHEN $5::numeric > 0 AND status = 'used_up' THEN 'active' ELSE status END,
            updated_at = NOW()
      WHERE id = $8
  RETURNING *`,
    [
      tier.id,
      tier.name || pkg.package_name,
      tier.lesson_service_name || null,
      newTotalHours,
      newRemaining,
      newPriceNative,
      newOriginalPrice,
      packageId,
    ]
  );

  // 2) Wallet settlement for the price delta (only if the package was paid).
  let walletAdjustment = null;
  if (settleWallet && Math.abs(delta) >= 0.005) {
    if (pkg.was_actually_paid) {
      const isCredit = delta < 0;
      const absAmount = Math.abs(delta);
      walletAdjustment = await recordWalletTransaction({
        client,
        userId: pkg.customer_id,
        amount: isCredit ? absAmount : -absAmount,
        availableDelta: isCredit ? absAmount : -absAmount,
        transactionType: TRANSACTION_TYPE.PACKAGE_PRICE_ADJUSTMENT,
        status: WALLET_TX_STATUS.COMPLETED,
        direction: isCredit ? TX_DIRECTION.CREDIT : TX_DIRECTION.DEBIT,
        currency: pkgCurrency,
        description: isCredit
          ? `Package upgraded to ${tier.name} — refund ${absAmount} ${pkgCurrency}: ${trimmedReason}`
          : `Package upgraded to ${tier.name} — charge ${absAmount} ${pkgCurrency}: ${trimmedReason}`,
        paymentMethod: PAYMENT_METHOD.PACKAGE_PRICE_ADJUSTMENT,
        referenceNumber: packageId,
        metadata: {
          packageId, packageName: tier.name, oldPrice, newPrice: newPriceNative, delta,
          oldServicePackageId: pkg.service_package_id, newServicePackageId: tier.id,
          oldTotalHours, newTotalHours, reason: trimmedReason, actorId, upgrade: true,
        },
        entityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityType: WALLET_ENTITY_TYPE.CUSTOMER_PACKAGE,
        relatedEntityId: packageId,
        createdBy: actorId,
        allowNegative: true,
      });
    } else {
      logger.info('Package not paid — skipping wallet adjustment for upgrade', { packageId });
    }
  }

  // 3) Rebase any layered % discount against the new base price FIRST, so the
  //    effective per-hour rate below subtracts the correct (rebased) discount.
  //    computeEffectivePackageHourlyRate reads discounts.amount, so re-pricing the
  //    ledger before this would freeze a rate computed against the stale discount.
  const discountResult = await recomputeDiscountForCustomerPackage(client, {
    packageId, newBasePrice: newPriceNative, currency: pkgCurrency, createdBy: actorId,
  });

  // 4) Compute the new effective per-hour rate (reads the new price/hours/discount)
  //    and re-price every active consumption draw to it, preserving the first rate.
  const newRate = await BookingUpdateCascadeService.computeEffectivePackageHourlyRate(client, packageId);
  const ledgerRepriced = await client.query(
    `UPDATE booking_package_consumption
        SET original_rate_per_hour = COALESCE(original_rate_per_hour, rate_per_hour),
            rate_per_hour = $1
      WHERE customer_package_id = $2 AND released_at IS NULL`,
    [Number.isFinite(newRate) ? newRate : null, packageId]
  );

  // 5) Re-derive manager commissions + instructor earnings + booking final_amount
  //    from the re-priced ledger. Both helpers skip payroll-settled rows.
  const commissionResult = await recomputeManagerCommissionsForPackage(client, packageId);
  const earningsResult = await BookingUpdateCascadeService.recomputeEarningsForPackageBookings(client, packageId);

  // Build the per-lesson drill-down (old → new lesson value on THIS package).
  const afterRes = await client.query(
    `SELECT id, final_amount FROM bookings WHERE customer_package_id = $1 AND deleted_at IS NULL`,
    [packageId]
  );
  const afterFinal = new Map(afterRes.rows.map((r) => [r.id, r.final_amount]));
  const rate = Number.isFinite(newRate) ? newRate : 0;
  const oldRate = Number.isFinite(oldEffectiveRate) ? oldEffectiveRate : 0;
  const affectedLessons = [];
  for (const b of beforeRes.rows) {
    const pkgHours = Number(b.pkg_hours) || 0;
    const duration = Number(b.duration) || 0;
    // Hours funded by THIS package: ledger hours, or the full duration for a
    // legacy package booking (no ledger rows).
    const hours = pkgHours > 0 ? pkgHours : duration;
    let oldAmount;
    let newAmount;
    if (pkgHours > 0) {
      // Ledger-backed: show the re-priced package PORTION of the lesson (the
      // old value is the sum of the frozen per-hour rates actually charged).
      oldAmount = Number(new Decimal(b.pkg_value || 0).toDecimalPlaces(2).toString());
      newAmount = Number(new Decimal(pkgHours).mul(rate).toDecimalPlaces(2).toString());
    } else {
      // Legacy (no ledger): the stored final_amount is often 0, so value the
      // lesson at the package's effective per-hour rate × duration (old → new).
      oldAmount = Number(new Decimal(duration).mul(oldRate).toDecimalPlaces(2).toString());
      const af = afterFinal.get(b.id);
      newAmount = af != null && Number(af) > 0
        ? Number(af)
        : Number(new Decimal(duration).mul(rate).toDecimalPlaces(2).toString());
    }
    const changed = oldAmount == null || newAmount == null
      ? false
      : Math.abs(oldAmount - newAmount) >= 0.005;
    if (hours > 0 || changed) {
      affectedLessons.push({
        bookingId: b.id,
        date: b.date,
        status: b.status,
        paymentStatus: b.payment_status,
        packageHours: hours,
        oldAmount,
        newAmount,
        paidOut: !!b.payroll_id,
      });
    }
  }
  const paidOutCount = affectedLessons.filter((l) => l.paidOut).length;

  logger.info(dryRun ? 'Customer package upgrade previewed' : 'Customer package upgraded', {
    packageId, oldPrice, newPrice: newPriceNative, delta,
    oldServicePackageId: pkg.service_package_id, newServicePackageId: tier.id,
    ledgerRowsRepriced: ledgerRepriced.rowCount,
    affectedLessons: affectedLessons.length, paidOutCount, dryRun, actorId,
  });

  return {
    package: normalizePackageRow(updated.rows[0]),
    oldServicePackageId: pkg.service_package_id,
    newServicePackageId: tier.id,
    tierName: tier.name,
    oldPrice,
    newPrice: newPriceNative,
    delta,
    oldTotalHours,
    newTotalHours,
    newRatePerHour: rate,
    ledgerRowsRepriced: ledgerRepriced.rowCount,
    walletAdjustment,
    discount: discountResult,
    commissions: commissionResult,
    instructorEarnings: earningsResult,
    affectedLessons,
    paidOutCount,
    dryRun: !!dryRun,
  };
}

export function mapWalletTransactionForResponse(walletTransaction) {
  if (!walletTransaction) {
    return null;
  }

  return {
    id: walletTransaction.id,
    userId: walletTransaction.user_id,
    balanceId: walletTransaction.balance_id,
    transactionType: walletTransaction.transaction_type,
    status: walletTransaction.status,
    direction: walletTransaction.direction,
    currency: walletTransaction.currency,
    amount:
      walletTransaction.amount != null ? Number(walletTransaction.amount) : null,
    availableDelta:
      walletTransaction.available_delta != null
        ? Number(walletTransaction.available_delta)
        : null,
    pendingDelta:
      walletTransaction.pending_delta != null ? Number(walletTransaction.pending_delta) : null,
    nonWithdrawableDelta:
      walletTransaction.non_withdrawable_delta != null
        ? Number(walletTransaction.non_withdrawable_delta)
        : null,
    balanceAvailableAfter:
      walletTransaction.balance_available_after != null
        ? Number(walletTransaction.balance_available_after)
        : null,
    balancePendingAfter:
      walletTransaction.balance_pending_after != null
        ? Number(walletTransaction.balance_pending_after)
        : null,
    balanceNonWithdrawableAfter:
      walletTransaction.balance_non_withdrawable_after != null
        ? Number(walletTransaction.balance_non_withdrawable_after)
        : null,
    description: walletTransaction.description,
    relatedEntityType: walletTransaction.related_entity_type,
    relatedEntityId: walletTransaction.related_entity_id,
    createdBy: walletTransaction.created_by,
    transactionDate: walletTransaction.transaction_date,
    createdAt: walletTransaction.created_at,
    metadata: walletTransaction.metadata
  };
}
