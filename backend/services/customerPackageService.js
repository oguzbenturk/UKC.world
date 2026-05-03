import Decimal from 'decimal.js';
import {
  recordLegacyTransaction,
  recordTransaction as recordWalletTransaction,
  getWalletAccountSummary
} from './walletService.js';
import { logger } from '../middlewares/errorHandler.js';
import { recomputeDiscountForCustomerPackage } from './discountService.js';
import { recomputeManagerCommissionsForPackage } from './managerCommissionService.js';
import BookingUpdateCascadeService from './bookingUpdateCascadeService.js';

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
        status: 'completed',
        direction: 'credit',
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
        entityType: 'customer_package',
        relatedEntityType: 'customer_package',
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
          status: 'completed',
          direction: 'debit',
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
          entityType: 'customer_package',
          relatedEntityType: 'customer_package',
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
        transactionType: 'package_price_adjustment',
        status: 'completed',
        direction: isCredit ? 'credit' : 'debit',
        currency,
        description: isCredit
          ? `Package price reduced (${pkg.package_name}): ${trimmedReason}`
          : `Package price increased (${pkg.package_name}): ${trimmedReason}`,
        paymentMethod: 'package_price_adjustment',
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
        entityType: 'customer_package',
        relatedEntityType: 'customer_package',
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
