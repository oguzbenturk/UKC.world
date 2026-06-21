/**
 * Booking Funding Service
 *
 * Switches an EXISTING booking between cash funding and package funding, after
 * the fact, from the booking detail view. This is the post-creation counterpart
 * to the consumption logic baked into POST /bookings — payment method used to be
 * frozen at creation.
 *
 *   cash  → package : draw the lesson's hours from the customer's compatible
 *                     packages (cross-package FIFO, overflow → cash 'partial'),
 *                     write the consumption ledger, and refund the cash that was
 *                     charged. Earnings / manager-commission re-derive from the
 *                     package value.
 *   package → cash  : restore the drawn hours to the package(s), re-charge the
 *                     lesson at the service's cash rate, earnings / commission
 *                     re-derive from the cash value.
 *
 * Everything runs inside the CALLER'S transaction (the route owns BEGIN/COMMIT)
 * so the ledger write, the wallet settlement and the earnings/commission
 * cascade commit atomically — a failure rolls the whole switch back, never
 * leaving a booking that is "package-funded AND cash-refunded" (or vice-versa).
 *
 * v1 scope: single-participant bookings only (group per-participant switching is
 * intentionally rejected with a clear error).
 */

import Decimal from 'decimal.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  consumeAcrossPackages,
  recordConsumptionLedger,
  restoreFromLedger,
  hasLedgerRows,
} from './packageConsumptionService.js';
import { recordTransaction as recordWalletTransaction } from './walletService.js';
import BookingUpdateCascadeService from './bookingUpdateCascadeService.js';
import {
  TRANSACTION_TYPE,
  TX_DIRECTION,
  WALLET_ENTITY_TYPE,
  WALLET_TX_STATUS,
} from '../constants/transactions.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const EPS = 0.005;

const CANCELLED_STATUSES = new Set([
  'cancelled', 'canceled', 'refunded', 'no_show', 'no-show', 'noshow', 'declined', 'rejected',
]);

// Charge-type wallet rows that make up a booking's NET cash charge. We isolate
// these (rather than summing every row for the booking) so the settlement below
// is not contaminated by discount_adjustment / refund credits that other flows
// manage on their own.
const CHARGE_TX_TYPES = ['booking_charge', 'charge', 'booking_charge_adjustment'];

/**
 * Move the customer's NET cash charge for a booking to `targetCharge` by posting
 * a single adjustment (debit to charge more, credit to refund). Idempotent by
 * construction: it reads the current charge and only posts the difference, so a
 * re-run that finds the target already met posts nothing.
 */
async function settleStudentCashTo(client, { bookingId, userId, currency, targetCharge, actorId, reason }) {
  if (!userId) return null;
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(available_delta), 0) AS net
       FROM wallet_transactions
      WHERE booking_id = $1 AND user_id = $2 AND status = 'completed'
        AND transaction_type = ANY($3)`,
    [bookingId, userId, CHARGE_TX_TYPES]
  );
  const net = Number(rows[0]?.net) || 0;       // negative = currently charged
  const chargedNow = -net;                      // positive = amount currently charged
  const target = Math.max(0, Number(targetCharge) || 0);
  const diff = new Decimal(target).sub(chargedNow).toDecimalPlaces(2).toNumber();
  if (Math.abs(diff) < EPS) return null;

  const isDebit = diff > 0;                      // need to charge MORE
  const signed = isDebit ? -Math.abs(diff) : Math.abs(diff);
  return recordWalletTransaction({
    client,
    userId,
    amount: signed,
    availableDelta: signed,
    transactionType: TRANSACTION_TYPE.BOOKING_CHARGE_ADJUSTMENT,
    status: WALLET_TX_STATUS.COMPLETED,
    direction: isDebit ? TX_DIRECTION.DEBIT : TX_DIRECTION.CREDIT,
    currency: currency || 'EUR',
    description: isDebit
      ? `Booking re-charged (${reason}): ${Math.abs(diff).toFixed(2)} ${currency || 'EUR'}`
      : `Booking refunded (${reason}): ${Math.abs(diff).toFixed(2)} ${currency || 'EUR'}`,
    entityType: WALLET_ENTITY_TYPE.BOOKING,
    relatedEntityType: WALLET_ENTITY_TYPE.BOOKING,
    relatedEntityId: bookingId,
    bookingId,
    metadata: { bookingId, reason, targetCharge: target, previousCharge: chargedNow, delta: diff, actorId },
    createdBy: actorId,
    allowNegative: true,
  });
}

// Legacy (no-ledger) restore: give hours back to a single package directly.
// Mirrors packageConsumptionService._restoreHoursToPackage (not exported).
async function restoreHoursToPackageLegacy(client, pkgId, hours) {
  if (!pkgId || !(hours > 0)) return;
  await client.query(
    `UPDATE customer_packages
        SET used_hours = GREATEST(0, COALESCE(used_hours, 0) - $1),
            remaining_hours = LEAST(COALESCE(total_hours, 0), COALESCE(remaining_hours, 0) + $1),
            status = CASE WHEN (COALESCE(remaining_hours, 0) + $1) > 0 AND status = 'used_up'
                          THEN 'active' ELSE status END,
            updated_at = NOW()
      WHERE id = $2`,
    [hours, pkgId]
  );
}

// Re-derive instructor earnings + manager commission for the new funding,
// WITHOUT letting the cascade touch the wallet (we settle the cash leg
// ourselves). Passing only `_custom_commission_changed` runs the earnings +
// commission steps but skips the discount-rebase and the customer-balance
// settlement.
//
// A funding switch RE-PRICES the lesson to the new funding's base (package rate
// or cash rate), so any pre-existing per-booking discount — which was negotiated
// against the OLD funding's price — is REMOVED (deleteDiscount reverses its
// wallet credit). Rebasing it instead would silently drag a cash-era % discount
// onto the package rate (and, for a package booking, leave a phantom credit
// because package bookings don't re-credit). Staff can re-apply a discount
// afterwards if they want one on the re-funded lesson. Returns # removed.
async function recomputeAfterSwitch(client, bookingId, actorId = null) {
  const { deleteDiscount } = await import('./discountService.js');
  const { rows: discRows } = await client.query(
    `SELECT id FROM discounts WHERE entity_type = 'booking' AND entity_id = $1`,
    [bookingId]
  );
  for (const d of discRows) {
    await deleteDiscount(client, d.id, { createdBy: actorId });
  }

  const { rows } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  const fresh = rows[0];
  if (!fresh) return discRows.length;
  await BookingUpdateCascadeService.cascadeBookingUpdate(
    fresh, { _custom_commission_changed: true }, { client, strict: true }
  );
  return discRows.length;
}

async function buildResult(client, bookingId, summary) {
  const { rows } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  return { booking: rows[0] || null, ...summary };
}

async function switchToPackage(client, ctx) {
  const { booking, customerId, currency, duration, svc, serviceHourly, requestedPackageId, actorId } = ctx;
  const bookingId = booking.id;
  const ps = String(booking.payment_status || '').toLowerCase();

  if (ps === 'package') throw httpError(400, 'Booking is already fully funded by a package.');
  if (await hasLedgerRows(client, bookingId)) {
    throw httpError(400, 'Booking already draws from a package. Switch it to cash first.');
  }

  // Draw hours from the customer's compatible packages. waiting_payment packages
  // are excluded — switching a confirmed/completed lesson onto an unpaid package
  // would put its funding in limbo.
  const spill = await consumeAcrossPackages(client, {
    customerId,
    hoursNeeded: duration,
    matchCriteria: {
      serviceName: svc.name,
      lessonCategoryTag: svc.lessonCategoryTag,
      disciplineTag: svc.disciplineTag,
    },
    requestedPackageId: requestedPackageId || null,
    asOfDate: booking.date,
    allowWaitingPayment: false,
  });

  if (!spill.draws.length) {
    throw httpError(400, svc.name
      ? `No active ${svc.name} package with hours for this customer. Assign/create a matching package first.`
      : 'No active package with hours for this customer. Assign/create a package first.');
  }

  await recordConsumptionLedger(client, { bookingId, participantId: null, draws: spill.draws });

  const packageHours = spill.packageHoursTotal;
  const cashHours = spill.cashHours;
  let paymentStatus;
  let finalAmount;
  let targetCharge;
  if (cashHours > 0.0001) {
    // Pool couldn't cover the full lesson → keep the overflow as a cash leg.
    paymentStatus = 'partial';
    finalAmount = parseFloat((cashHours * serviceHourly).toFixed(2));
    targetCharge = finalAmount;
  } else {
    paymentStatus = 'package';
    finalAmount = parseFloat(spill.draws.reduce((s, d) => s + d.hours * d.ratePerHour, 0).toFixed(2));
    targetCharge = 0;
  }

  await client.query(
    `UPDATE bookings
        SET payment_status = $1,
            customer_package_id = $2,
            package_hours_used = $3,
            cash_hours_used = $4,
            final_amount = $5,
            amount = $5,
            updated_at = NOW()
      WHERE id = $6`,
    [paymentStatus, spill.primaryPackageId, packageHours, cashHours || 0, finalAmount, bookingId]
  );

  const walletAdjustment = await settleStudentCashTo(client, {
    bookingId, userId: customerId, currency, targetCharge, actorId, reason: 'switched to package',
  });

  const discountsRemoved = await recomputeAfterSwitch(client, bookingId, actorId);

  logger.info('Booking switched to package funding', {
    bookingId, customerId, paymentStatus, packageHours, cashHours,
    primaryPackageId: spill.primaryPackageId, draws: spill.draws.length, discountsRemoved, actorId,
  });

  return buildResult(client, bookingId, {
    mode: 'package',
    paymentStatus,
    finalAmount,
    packageHoursDrawn: packageHours,
    cashHours,
    discountsRemoved,
    draws: spill.draws.map((d) => ({
      packageId: d.packageId, packageName: d.packageName, hours: d.hours, ratePerHour: d.ratePerHour,
    })),
    walletAdjustment,
  });
}

async function switchToCash(client, ctx) {
  const { booking, customerId, currency, duration, serviceHourly, actorId } = ctx;
  const bookingId = booking.id;
  const ps = String(booking.payment_status || '').toLowerCase();
  const hadLedger = await hasLedgerRows(client, bookingId);

  if (ps !== 'package' && ps !== 'partial' && !booking.customer_package_id && !hadLedger) {
    throw httpError(400, 'Booking is not funded by a package.');
  }

  // Restore the exact hours drawn back to the package(s).
  if (hadLedger) {
    await restoreFromLedger(client, { bookingId, participantId: null });
  } else if (booking.customer_package_id) {
    const recorded = parseFloat(booking.package_hours_used);
    const restoreHours = Number.isFinite(recorded) ? recorded : (ps === 'package' ? duration : 0);
    await restoreHoursToPackageLegacy(client, booking.customer_package_id, restoreHours);
  }

  let cashPrice = serviceHourly > 0 ? parseFloat((serviceHourly * duration).toFixed(2)) : 0;
  if (!(cashPrice > 0)) {
    // No service price to derive from — keep the lesson value the booking shows.
    cashPrice = parseFloat(booking.final_amount) || parseFloat(booking.amount) || 0;
  }

  await client.query(
    `UPDATE bookings
        SET payment_status = 'paid',
            customer_package_id = NULL,
            package_hours_used = 0,
            cash_hours_used = $1,
            final_amount = $2,
            amount = $2,
            updated_at = NOW()
      WHERE id = $3`,
    [duration, cashPrice, bookingId]
  );

  const walletAdjustment = await settleStudentCashTo(client, {
    bookingId, userId: customerId, currency, targetCharge: cashPrice, actorId, reason: 'switched to cash',
  });

  const discountsRemoved = await recomputeAfterSwitch(client, bookingId, actorId);

  logger.info('Booking switched to cash funding', { bookingId, customerId, cashPrice, discountsRemoved, actorId });

  return buildResult(client, bookingId, {
    mode: 'cash',
    paymentStatus: 'paid',
    finalAmount: cashPrice,
    discountsRemoved,
    walletAdjustment,
  });
}

/**
 * Switch a booking's funding method. Runs inside the caller's transaction.
 * @param {import('pg').PoolClient} client
 * @param {{ bookingId: string, mode: 'package'|'cash', requestedPackageId?: string|null, actorId?: string|null }} params
 */
export async function switchBookingFunding(client, { bookingId, mode, requestedPackageId = null, actorId = null }) {
  if (!client) throw new Error('Database client is required');
  if (mode !== 'package' && mode !== 'cash') {
    throw httpError(400, "mode must be 'package' or 'cash'");
  }

  const { rows: bRows } = await client.query(
    `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [bookingId]
  );
  if (!bRows.length) throw httpError(404, 'Booking not found');
  const booking = bRows[0];

  const { rows: pcRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM booking_participants WHERE booking_id = $1`,
    [bookingId]
  );
  if ((pcRows[0]?.n || 0) > 1) {
    throw httpError(400, 'Switching funding is not supported for multi-participant group bookings yet.');
  }

  const customerId = booking.student_user_id;
  if (!customerId) throw httpError(400, 'Booking has no customer to fund.');

  const statusLc = String(booking.status || '').toLowerCase().trim();
  if (CANCELLED_STATUSES.has(statusLc)) {
    throw httpError(400, `Cannot switch funding on a ${statusLc} booking.`);
  }
  if (statusLc === 'pending_payment' || String(booking.payment_status || '').toLowerCase() === 'pending_payment') {
    throw httpError(400, 'Cannot switch funding while the booking has a pending bank-transfer payment.');
  }

  const currency = booking.currency || 'EUR';
  const duration = parseFloat(booking.duration) || 0;
  if (!(duration > 0)) throw httpError(400, 'Booking has no duration to fund.');

  let svc = { name: null, lessonCategoryTag: null, disciplineTag: null, price: 0, durationHours: 0 };
  if (booking.service_id) {
    const { rows: sRows } = await client.query(
      `SELECT name, lesson_category_tag, discipline_tag, price, duration FROM services WHERE id = $1`,
      [booking.service_id]
    );
    if (sRows.length) {
      svc = {
        name: sRows[0].name || null,
        lessonCategoryTag: sRows[0].lesson_category_tag || null,
        disciplineTag: sRows[0].discipline_tag || null,
        price: parseFloat(sRows[0].price) || 0,
        durationHours: parseFloat(sRows[0].duration) || 0,
      };
    }
  }
  const serviceHourly = svc.durationHours > 0 ? svc.price / svc.durationHours : svc.price;

  const ctx = { booking, customerId, currency, duration, svc, serviceHourly, requestedPackageId, actorId };
  return mode === 'package' ? switchToPackage(client, ctx) : switchToCash(client, ctx);
}

export default { switchBookingFunding };
