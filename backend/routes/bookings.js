// Backend routes loaded
import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { bookingService } from '../services/bookingService.js';
import BookingUpdateCascadeService from '../services/bookingUpdateCascadeService.js';
import {
  consumeAcrossPackages,
  recordConsumptionLedger,
  consumeAdditionalForBooking,
  restoreFromLedger,
  releaseHoursFromLedger,
  reconsumeFromLedger,
} from '../services/packageConsumptionService.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/errorHandler.js';
import { queueRatingReminder } from '../services/ratingService.js';
import bookingNotificationService from '../services/bookingNotificationService.js';
import { resolveActorId, appendCreatedBy } from '../utils/auditUtils.js';
import { recordTransaction as recordWalletTransaction, recordLegacyTransaction, getEntityNetCharges } from '../services/walletService.js';
import { checkAndUpgradeAfterBooking } from '../services/roleUpgradeService.js';
import { getServicePriceInCurrency } from '../services/multiCurrencyPriceService.js';
import voucherService from '../services/voucherService.js';
import { sendEmail } from '../services/emailService.js';
import { buildBrandedEmail } from '../services/emailTemplates/brandedLayout.js';
import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
import socketService from '../services/socketService.js';
import { cacheMiddleware } from '../middlewares/cache.js';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import { parseHHMM, getWorkingHours } from '../utils/timeUtils.js';

const router = express.Router();

// If the booking's student is personally linked to its instructor (self-student),
// freeze a booking_custom_commissions row at the instructor's per-instructor
// self-student rate (default 45%). Idempotent on booking_id (UNIQUE).
// No-op when no self-student match, when fields are missing, or when an
// admin-set custom commission already exists (we don't want to clobber it).
async function applySelfStudentCommissionIfMatch(client, booking) {
  if (!booking?.id || !booking.student_user_id || !booking.instructor_user_id || !booking.service_id) {
    return;
  }
  const existing = await client.query(
    'SELECT 1 FROM booking_custom_commissions WHERE booking_id = $1',
    [booking.id]
  );
  if (existing.rows.length > 0) return;

  const ssRow = await client.query(
    `SELECT u.self_student_of_instructor_id,
            COALESCE(idc.self_student_commission_rate, 45) AS rate
       FROM users u
       LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = $2
      WHERE u.id = $1`,
    [booking.student_user_id, booking.instructor_user_id]
  );
  const row = ssRow.rows[0];
  if (!row || row.self_student_of_instructor_id !== booking.instructor_user_id) return;

  await client.query(
    `INSERT INTO booking_custom_commissions
       (booking_id, instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
     VALUES ($1, $2, $3, 'percentage', $4, NOW(), NOW())
     ON CONFLICT (booking_id) DO UPDATE
       SET commission_type = 'percentage',
           commission_value = EXCLUDED.commission_value,
           updated_at = NOW()`,
    [booking.id, booking.instructor_user_id, booking.service_id, row.rate]
  );
}
// Feature flag to optionally create cash transactions for partial package users
const BILLING_PARTIAL_PRECISION = (process.env.BILLING_PARTIAL_PRECISION === '1');
const DEFAULT_CURRENCY = process.env.DEFAULT_WALLET_CURRENCY?.toUpperCase() || 'EUR';

// Simple rate limiting map
const rateLimitMap = new Map();

// Cleanup rate limiting map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

// Rate limiting middleware for booking updates
const rateLimitBookingUpdates = (req, res, next) => {
  const key = `${req.ip}-${req.method}-${req.originalUrl}`;
  const now = Date.now();
  const windowMs = 5000; // 5 seconds
  const maxRequests = 5; // Max 5 requests per 5 seconds
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  const rateLimit = rateLimitMap.get(key);
  
  if (now > rateLimit.resetTime) {
    rateLimit.count = 1;
    rateLimit.resetTime = now + windowMs;
    return next();
  }
  
  if (rateLimit.count >= maxRequests) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: Math.ceil((rateLimit.resetTime - now) / 1000)
    });
  }
  
  rateLimit.count++;
  next();
};

// S3: keep this aligned with the cascade's earnings-creation set
// (['completed','done','checked_out']). Previously only 'completed' created a
// manager commission, so a 'done'/'checked_out' completion paid the instructor
// but left the manager with no commission row for that lesson.
const COMPLETED_BOOKING_STATUSES = new Set(['completed', 'done', 'checked_out']);

const resolveServiceType = (serviceRow) => {
  if (!serviceRow) {
    return 'lesson';
  }

  const candidates = [serviceRow.service_type, serviceRow.category, serviceRow.name]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''));

  if (candidates.some((value) => value.includes('rental') || value.includes('equipment'))) {
    return 'rental';
  }

  if (candidates.some((value) => value.includes('accommodation') || value.includes('lodging') || value.includes('stay'))) {
    return 'accommodation';
  }

  return 'lesson';
};

  // Helper: restore hours to a specific customer package ID
  async function restoreHoursToPackage(client, pkgId, restoreHours) {
    if (!pkgId || !restoreHours || restoreHours <= 0) return null;
    const { rows: pkgRows } = await client.query(
      `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
       FROM customer_packages WHERE id = $1`,
      [pkgId]
    );
    if (pkgRows.length === 0) return null;
    const pkg = pkgRows[0];
    const newUsed = Math.max(0, (parseFloat(pkg.used_hours) || 0) - parseFloat(restoreHours));
    const newRemaining = Math.min(
      parseFloat(pkg.total_hours) || 0,
      (parseFloat(pkg.remaining_hours) || 0) + parseFloat(restoreHours)
    );
    const newStatus = newRemaining > 0 ? 'active' : pkg.status;
    const { rows: upd } = await client.query(
      `UPDATE customer_packages
       SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING package_name, used_hours, remaining_hours, status`,
      [newUsed, newRemaining, newStatus, pkgId]
    );
    if (upd.length === 0) return null;
    const up = upd[0];
    return {
      packageId: pkgId,
      packageName: up.package_name,
      hoursRestored: parseFloat(restoreHours),
      newUsedHours: up.used_hours,
      newRemainingHours: up.remaining_hours,
      newStatus: up.status,
    };
  }

  // Helper: consume additional hours from a package. Mirrors restoreHoursToPackage
  // for the inverse operation — used when a booking's duration is edited UPWARD
  // and the linked package needs to absorb the delta. Caps at total_hours so a
  // package can't go negative-remaining unless the caller explicitly allows it.
  async function consumeHoursFromPackage(client, pkgId, consumeHours, { allowNegative = false } = {}) {
    if (!pkgId || !consumeHours || consumeHours <= 0) return null;
    const { rows: pkgRows } = await client.query(
      `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
       FROM customer_packages WHERE id = $1`,
      [pkgId]
    );
    if (pkgRows.length === 0) return null;
    const pkg = pkgRows[0];
    const totalHours = parseFloat(pkg.total_hours) || 0;
    const currentUsed = parseFloat(pkg.used_hours) || 0;
    const currentRemaining = parseFloat(pkg.remaining_hours);
    const liveRemaining = Number.isFinite(currentRemaining) ? currentRemaining : (totalHours - currentUsed);
    const delta = parseFloat(consumeHours);

    if (!allowNegative && delta > liveRemaining + 0.0001) {
      return { error: 'insufficient_hours', packageId: pkgId, requested: delta, available: Math.max(0, liveRemaining) };
    }

    const newUsed = currentUsed + delta;
    const newRemaining = Math.max(allowNegative ? Number.NEGATIVE_INFINITY : 0, liveRemaining - delta);
    // `customer_packages.check_status_valid` constraint allows only
    // 'active' | 'expired' | 'used_up' | 'cancelled' | 'pending_payment' | 'waiting_payment'.
    // Previously we wrote 'completed' here, which the constraint rejects with 23514 and the
    // whole PUT /bookings/:id transaction rolls back — surfaced on prod 2026-05-30 as a
    // ~20× retry loop on duration edits of fully-consumed packages.
    const newStatus = newRemaining > 0 ? 'active' : pkg.status === 'active' ? 'used_up' : pkg.status;
    const { rows: upd } = await client.query(
      `UPDATE customer_packages
       SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING package_name, used_hours, remaining_hours, status`,
      [newUsed, newRemaining, newStatus, pkgId]
    );
    if (upd.length === 0) return null;
    const up = upd[0];
    return {
      packageId: pkgId,
      packageName: up.package_name,
      hoursConsumed: delta,
      newUsedHours: up.used_hours,
      newRemainingHours: up.remaining_hours,
      newStatus: up.status,
    };
  }

  // Helper: does this booking have ANY cross-package spillover ledger rows
  // (released or not)? Gates the ledger-aware reversal/edit branches — a booking
  // with rows always takes the ledger path; one without keeps the legacy path.
  async function bookingHasAnyLedger(client, bookingId) {
    if (!bookingId) return false;
    const { rows } = await client.query(
      `SELECT 1 FROM booking_package_consumption WHERE booking_id = $1 LIMIT 1`,
      [bookingId]
    );
    return rows.length > 0;
  }

  // Helper: restore the EXACT package hours a booking drew, on cancel/delete.
  // Participant-aware and partial-aware: restores each participant's recorded
  // `package_hours_used` (NOT the full booking duration), covering both 'package'
  // and 'partial' participants; falls back to the booking-level recorded split
  // when there are no participant rows. Legacy rows with no recorded hours fall
  // back to `duration` for pure-package bookings and 0 for partials (so we never
  // invent hours that were never drawn). Returns the restore results.
  async function restoreBookingPackageHours(client, booking) {
    const duration = parseFloat(booking.duration) || 0;
    const results = [];

    // Ledger-aware: a spillover booking restores hours precisely from its ledger
    // (across every package and participant it drew from). Gated on "has ANY
    // ledger rows" — restoreFromLedger only touches non-released rows, so a
    // second call (cancel then delete) is idempotent and never double-restores.
    if (await bookingHasAnyLedger(client, booking.id)) {
      const { rows: scopes } = await client.query(
        `SELECT DISTINCT participant_id FROM booking_package_consumption WHERE booking_id = $1`,
        [booking.id]
      );
      for (const s of scopes) {
        const r = await restoreFromLedger(client, { bookingId: booking.id, participantId: s.participant_id });
        results.push(...r);
      }
      return results;
    }

    const { rows: parts } = await client.query(
      `SELECT id, customer_package_id, payment_status, package_hours_used
         FROM booking_participants WHERE booking_id = $1`,
      [booking.id]
    );
    const partsWithPkg = parts.filter((p) => p.customer_package_id &&
      (p.payment_status === 'package' || p.payment_status === 'partial'));
    if (partsWithPkg.length > 0) {
      for (const p of partsWithPkg) {
        const recorded = parseFloat(p.package_hours_used);
        const restoreHours = Number.isFinite(recorded) ? recorded
          : (p.payment_status === 'package' ? duration : 0);
        if (restoreHours > 0) {
          const r = await restoreHoursToPackage(client, p.customer_package_id, restoreHours);
          if (r) results.push(r);
        }
      }
      return results;
    }
    if (booking.customer_package_id &&
        (booking.payment_status === 'package' || booking.payment_status === 'partial')) {
      const recorded = parseFloat(booking.package_hours_used);
      const restoreHours = Number.isFinite(recorded) ? recorded
        : (booking.payment_status === 'package' ? duration : 0);
      if (restoreHours > 0) {
        const r = await restoreHoursToPackage(client, booking.customer_package_id, restoreHours);
        if (r) results.push(r);
      }
    }
    return results;
  }

  // Helper: re-consume the EXACT recorded package hours when a deleted booking
  // is restored (inverse of restoreBookingPackageHours). Uses each participant's
  // recorded package_hours_used (partial-aware) instead of the full duration,
  // and flips the package to 'used_up' if it hits zero.
  async function reconsumeBookingPackageHours(client, booking) {
    const duration = parseFloat(booking.duration) || 0;

    // Ledger-aware: re-consume the exact released draws (idempotent — only acts
    // on rows previously released by restoreFromLedger).
    if (await bookingHasAnyLedger(client, booking.id)) {
      const { rows: scopes } = await client.query(
        `SELECT DISTINCT participant_id FROM booking_package_consumption WHERE booking_id = $1`,
        [booking.id]
      );
      for (const s of scopes) {
        await reconsumeFromLedger(client, { bookingId: booking.id, participantId: s.participant_id });
      }
      return;
    }

    const consume = async (pkgId, hours) => {
      if (!pkgId || !(hours > 0)) return;
      await client.query(
        `UPDATE customer_packages
            SET used_hours = COALESCE(used_hours,0) + $1,
                remaining_hours = GREATEST(0, COALESCE(remaining_hours,0) - $1),
                status = CASE WHEN GREATEST(0, COALESCE(remaining_hours,0) - $1) <= 0 AND status = 'active'
                              THEN 'used_up' ELSE status END,
                updated_at = NOW()
          WHERE id = $2`,
        [hours, pkgId]
      );
    };
    const { rows: parts } = await client.query(
      `SELECT customer_package_id, payment_status, package_hours_used
         FROM booking_participants WHERE booking_id = $1`,
      [booking.id]
    );
    const partsWithPkg = parts.filter((p) => p.customer_package_id &&
      (p.payment_status === 'package' || p.payment_status === 'partial'));
    if (partsWithPkg.length > 0) {
      for (const p of partsWithPkg) {
        const recorded = parseFloat(p.package_hours_used);
        const hours = Number.isFinite(recorded) ? recorded : (p.payment_status === 'package' ? duration : 0);
        await consume(p.customer_package_id, hours);
      }
      return;
    }
    if (booking.customer_package_id &&
        (booking.payment_status === 'package' || booking.payment_status === 'partial')) {
      const recorded = parseFloat(booking.package_hours_used);
      const hours = Number.isFinite(recorded) ? recorded : (booking.payment_status === 'package' ? duration : 0);
      await consume(booking.customer_package_id, hours);
    }
  }

  // Helper: re-activate a restored booking's manager commission (the delete set
  // it 'cancelled'); leaves paid-out rows untouched.
  async function reactivateManagerCommissionForBooking(client, bookingId) {
    await client.query(
      `UPDATE manager_commissions
          SET status = 'pending', updated_at = NOW()
        WHERE source_type = 'booking' AND source_id = $1 AND status = 'cancelled'`,
      [String(bookingId)]
    );
  }

  // Helper: re-seed the unpaid instructor_earnings snapshot for a booking that
  // was just restored from soft-delete. The delete flow removed it; without
  // this, a restored COMPLETED lesson came back with a re-activated manager
  // commission but no instructor cost (asymmetric books). No-op for
  // non-completed statuses (the completion cascade creates earnings later).
  async function reseedEarningsForRestoredBooking(client, bookingId) {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL',
      [bookingId]
    );
    if (!rows.length) return;
    const restored = rows[0];
    if (!COMPLETED_BOOKING_STATUSES.has(String(restored.status || '').toLowerCase().trim())) return;
    await BookingUpdateCascadeService.updateInstructorEarnings(client, restored);
  }

  // Helper: refund each payer their OWN outstanding wallet charge for a booking.
  // Uses getEntityNetCharges({ byUser: true }) so a group booking refunds every
  // participant the net they actually paid (not the lump sum to the primary),
  // refunds nothing for cash/gateway bookings (no wallet charge => no phantom
  // credit), and is idempotent per (reason, booking, user, currency) so retries
  // never double-refund. Returns the total amount refunded.
  async function refundBookingNetChargesPerUser(client, booking, { transactionType = 'booking_cancelled_refund', reason = 'booking_cancelled', actorId = null } = {}) {
    const nets = await getEntityNetCharges({ client, bookingId: booking.id, byUser: true });
    let totalRefunded = 0;
    for (const n of nets) {
      if (!n.userId || !(n.amount > 0)) continue;
      await recordWalletTransaction({
        client,
        userId: n.userId,
        amount: Math.abs(n.amount),
        availableDelta: Math.abs(n.amount),
        transactionType,
        status: 'completed',
        direction: 'credit',
        currency: n.currency || 'EUR',
        description: `Refund: ${reason.replace(/_/g, ' ')}`,
        entityType: 'booking',
        relatedEntityType: 'booking',
        relatedEntityId: booking.id,
        bookingId: booking.id,
        idempotencyKey: `${reason}:${booking.id}:${n.userId}:${n.currency}`,
        metadata: { reason, bookingId: booking.id },
        createdBy: actorId,
        allowNegative: true,
      });
      totalRefunded += Math.abs(n.amount);
    }
    return totalRefunded;
  }

  // Helper: drop the instructor_earnings snapshot for a booking that is no
  // longer billable (cancelled / deleted), so it stops counting as instructor
  // cost in snapshot-based aggregates (finances.js, cashModeAggregator). Never
  // touches a row already settled in payroll (payroll_id IS NOT NULL).
  async function clearInstructorEarningsForBooking(client, bookingId) {
    const { rowCount } = await client.query(
      `DELETE FROM instructor_earnings WHERE booking_id = $1 AND payroll_id IS NULL`,
      [bookingId]
    );
    return rowCount;
  }

  // Helper: move a single package's hours to cover `newTargetHours` of a booking
  // under the "package-first, then cash" policy. `basePkg` is how many hours this
  // booking already draws from the package. We fill as much of the new duration
  // from the package as it can still cover (already-drawn + currently-remaining),
  // overflow stays cash. Returns { newPkg, newCash, adjustment }.
  async function applyPackageFirstDelta(client, pkgId, basePkg, newTargetHours) {
    const { rows } = await client.query(
      `SELECT total_hours, used_hours, remaining_hours FROM customer_packages WHERE id = $1`,
      [pkgId]
    );
    if (!rows.length) return { newPkg: basePkg, newCash: Math.max(0, newTargetHours - basePkg), adjustment: null };
    const r = rows[0];
    const totalH = parseFloat(r.total_hours) || 0;
    const usedH = parseFloat(r.used_hours) || 0;
    const remaining = r.remaining_hours != null ? (parseFloat(r.remaining_hours) || 0) : Math.max(0, totalH - usedH);
    const maxCover = basePkg + remaining;            // hours this package could fund
    const newPkg = Math.max(0, Math.min(newTargetHours, maxCover));
    const pkgDelta = newPkg - basePkg;
    let adjustment = null;
    if (pkgDelta > 0.0001) {
      adjustment = await consumeHoursFromPackage(client, pkgId, pkgDelta, { allowNegative: false });
    } else if (pkgDelta < -0.0001) {
      adjustment = await restoreHoursToPackage(client, pkgId, Math.abs(pkgDelta));
    }
    return { newPkg, newCash: Math.max(0, newTargetHours - newPkg), adjustment };
  }

  // Helper: reconcile a single booking's duration change with the linked
  // customer_package(s) AND its cash leg. Called from PUT /:id whenever
  // `duration` is edited. Policy: PACKAGE FIRST, THEN CASH — the new duration is
  // funded from remaining package hours first, any overflow becomes cash. Covers
  // 'package' AND 'partial' bookings (the latter was previously skipped entirely,
  // leaving used_hours frozen and the cash leg stale). For partial bookings the
  // cash leg (final_amount) is recomputed and the wallet delta settled here, so
  // the cascade's updateCustomerBalance intentionally skips partial/package.
  // Helper: reconcile a SPILLOVER (ledger-backed) booking's duration change.
  // Decrease → release hours LIFO (newest draw first). Increase → chain
  // additional pooled hours across the customer's packages, overflowing to cash.
  // Keeps package_hours_used / cash_hours_used in sync; settles the cash leg for
  // single bookings (group per-participant cash settlement is left to the price
  // edit fan-out, matching the legacy policy).
  async function reconcileLedgerDurationChange(client, booking, oldD, newD, preEditBooking) {
    const pre = preEditBooking || booking;
    const delta = newD - oldD;
    const adjustments = [];

    let serviceHourly = 0;
    let matchCriteria = {};
    try {
      const { rows: svc } = await client.query(
        'SELECT price, duration, name, discipline_tag, lesson_category_tag FROM services WHERE id = $1',
        [booking.service_id]
      );
      if (svc.length) {
        const sp = parseFloat(svc[0].price) || 0;
        const sd = parseFloat(svc[0].duration) || 1;
        serviceHourly = sd > 0 ? sp / sd : sp;
        matchCriteria = {
          serviceName: svc[0].name,
          lessonCategoryTag: svc[0].lesson_category_tag,
          disciplineTag: svc[0].discipline_tag,
        };
      }
    } catch { /* ignore */ }

    const sumLedger = async (participantId) => {
      const clause = participantId ? 'participant_id = $2' : 'participant_id IS NULL';
      const params = participantId ? [booking.id, participantId] : [booking.id];
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(hours_used), 0) AS s FROM booking_package_consumption
          WHERE booking_id = $1 AND released_at IS NULL AND ${clause}`,
        params
      );
      return parseFloat(rows[0].s) || 0;
    };

    const { rows: scopeRows } = await client.query(
      `SELECT DISTINCT participant_id FROM booking_package_consumption WHERE booking_id = $1`,
      [booking.id]
    );
    const participantScopes = scopeRows.map((r) => r.participant_id).filter(Boolean);

    // ── Group: adjust each participant's draws + their participant-row columns.
    if (participantScopes.length > 0) {
      for (const pid of participantScopes) {
        const { rows: pr } = await client.query(
          'SELECT user_id FROM booking_participants WHERE id = $1', [pid]
        );
        const userId = pr[0]?.user_id;
        const before = await sumLedger(pid);
        let newPkg = before;
        if (delta > 0.0001 && userId) {
          const add = await consumeAdditionalForBooking(client, {
            bookingId: booking.id, participantId: pid, customerId: userId,
            hoursNeeded: delta, matchCriteria, asOfDate: booking.date,
          });
          newPkg = before + add.packageHoursTotal;
        } else if (delta < -0.0001) {
          const released = await releaseHoursFromLedger(client, {
            bookingId: booking.id, participantId: pid, hoursToRelease: -delta,
          });
          newPkg = before - released;
        }
        newPkg = parseFloat(newPkg.toFixed(2));
        const newCash = Math.max(0, parseFloat((newD - newPkg).toFixed(2)));
        await client.query(
          `UPDATE booking_participants
              SET package_hours_used = $1, cash_hours_used = $2,
                  payment_status = CASE WHEN $2 > 0 THEN 'partial' WHEN $1 > 0 THEN 'package' ELSE payment_status END,
                  updated_at = NOW()
            WHERE id = $3`,
          [newPkg, newCash, pid]
        );
      }
      return adjustments;
    }

    // ── Single booking (participant_id IS NULL ledger rows).
    const before = await sumLedger(null);
    let newPkg = before;
    if (delta > 0.0001) {
      const add = await consumeAdditionalForBooking(client, {
        bookingId: booking.id, participantId: null, customerId: booking.student_user_id,
        hoursNeeded: delta, matchCriteria, asOfDate: booking.date,
      });
      newPkg = before + add.packageHoursTotal;
    } else if (delta < -0.0001) {
      const released = await releaseHoursFromLedger(client, {
        bookingId: booking.id, participantId: null, hoursToRelease: -delta,
      });
      newPkg = before - released;
    }
    newPkg = parseFloat(newPkg.toFixed(2));
    const newCash = Math.max(0, parseFloat((newD - newPkg).toFixed(2)));

    // Cash-leg settlement (same machinery as the legacy single path).
    const oldFinal = parseFloat(pre.final_amount) || 0;
    const recordedCash = parseFloat(pre.cash_hours_used);
    let perHourCash = (Number.isFinite(recordedCash) && recordedCash > 0 && oldFinal > 0)
      ? oldFinal / recordedCash
      : serviceHourly;
    if (!(perHourCash > 0)) perHourCash = serviceHourly;

    let oldCashLeg = pre.payment_status === 'partial' ? oldFinal : 0;
    try {
      const nets = await getEntityNetCharges({ client, bookingId: booking.id, byUser: true });
      const own = nets.find((n) => n.userId === booking.student_user_id &&
        (n.currency || 'EUR') === (booking.currency || 'EUR'));
      oldCashLeg = own && Number.isFinite(own.amount) ? Math.max(0, own.amount) : 0;
    } catch { /* keep fallback */ }

    const newCashLeg = parseFloat((newCash * perHourCash).toFixed(2));
    const newPaymentStatus = newPkg <= 0 ? 'paid' : (newCash > 0.0001 ? 'partial' : 'package');
    const flippedFromCashLeg = newPaymentStatus === 'package' &&
      (pre.payment_status === 'partial' || oldCashLeg > 0);

    if (flippedFromCashLeg) {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = 0,
            final_amount = 0, amount = 0, payment_status = 'package', updated_at = NOW() WHERE id = $2`,
        [newPkg, booking.id]
      );
    } else if (newPaymentStatus === 'package') {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = 0,
            payment_status = 'package', updated_at = NOW() WHERE id = $2`,
        [newPkg, booking.id]
      );
    } else {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = $2,
            final_amount = $3, amount = $3, payment_status = $4, updated_at = NOW() WHERE id = $5`,
        [newPkg, newCash, newCashLeg, newPaymentStatus, booking.id]
      );
    }

    booking.package_hours_used = newPkg;
    booking.cash_hours_used = newCash;
    booking.payment_status = newPaymentStatus;
    if (newPaymentStatus !== 'package') { booking.final_amount = newCashLeg; booking.amount = newCashLeg; }
    else if (flippedFromCashLeg) { booking.final_amount = 0; booking.amount = 0; }

    const cashDelta = parseFloat((newCashLeg - oldCashLeg).toFixed(2));
    if (booking.student_user_id && Math.abs(cashDelta) > 0.009) {
      try {
        await recordWalletTransaction({
          client, userId: booking.student_user_id,
          amount: -cashDelta, availableDelta: -cashDelta,
          transactionType: 'booking_charge_adjustment', status: 'completed',
          direction: cashDelta > 0 ? 'debit' : 'credit', currency: booking.currency || 'EUR',
          description: cashDelta > 0
            ? `Partial lesson cash leg increased: €${Math.abs(cashDelta)}`
            : `Partial lesson cash leg reduced: €${Math.abs(cashDelta)}`,
          entityType: 'booking', relatedEntityType: 'booking', relatedEntityId: booking.id,
          bookingId: booking.id,
          metadata: { reason: 'duration_edit_cash_leg_spillover', oldCashLeg, newCashLeg, newPkgHours: newPkg, newCashHours: newCash },
          allowNegative: true,
        });
      } catch (walletErr) {
        logger.warn('Failed to settle spillover partial cash-leg on duration edit', { bookingId: booking.id, error: walletErr.message });
      }
    }

    return adjustments;
  }

  async function reconcilePackageHoursOnDurationChange(client, booking, oldDuration, newDuration, preEditBooking = null) {
    const oldD = parseFloat(oldDuration) || 0;
    const newD = parseFloat(newDuration) || 0;
    const delta = newD - oldD;
    if (Math.abs(delta) < 0.0001) return [];

    // Spillover (ledger-backed) bookings reconcile via the ledger; legacy
    // bookings keep the single-package reconstruction below, byte-for-byte.
    if (await bookingHasAnyLedger(client, booking.id)) {
      return await reconcileLedgerDurationChange(client, booking, oldD, newD, preEditBooking);
    }

    // Old-state reads (recorded split, charged cash leg, payment status) must
    // come from the row as it was BEFORE the PUT's raw UPDATE: the caller may
    // edit price and duration in one request, and the post-update row then
    // reports the request's NEW amount as the "old" cash leg — settling the
    // wallet against a number the customer never paid (€47.50 charged, €28
    // refunded — Işık Aslan Dede, June 2026).
    const pre = preEditBooking || booking;

    const adjustments = [];

    // ── Participant path (group / multi-user): reconcile every package-drawing
    //    participant (package OR partial) under the package-first policy. Group
    //    per-participant CASH-leg settlement on a duration edit is left to the
    //    explicit price-edit fan-out; here we keep the package ledger correct.
    const participantsRes = await client.query(
      `SELECT id, customer_package_id, payment_status, package_hours_used
         FROM booking_participants
        WHERE booking_id = $1 AND customer_package_id IS NOT NULL
          AND payment_status IN ('package', 'partial')`,
      [booking.id]
    );

    if (participantsRes.rows.length > 0) {
      for (const p of participantsRes.rows) {
        const recorded = parseFloat(p.package_hours_used);
        const basePkg = Number.isFinite(recorded) ? recorded : (p.payment_status === 'package' ? oldD : 0);
        const res = await applyPackageFirstDelta(client, p.customer_package_id, basePkg, newD);
        if (res.adjustment?.error === 'insufficient_hours') {
          const err = new Error(`Package has only ${res.adjustment.available}h remaining.`);
          err.status = 400; err.code = 'package_insufficient_hours';
          throw err;
        }
        if (res.adjustment) adjustments.push({ ...res.adjustment, participantId: p.id });
        await client.query(
          `UPDATE booking_participants
              SET package_hours_used = $1, cash_hours_used = $2,
                  payment_status = CASE WHEN $2 > 0 THEN 'partial' WHEN $1 > 0 THEN 'package' ELSE payment_status END,
                  updated_at = NOW()
            WHERE id = $3`,
          [res.newPkg, res.newCash, p.id]
        );
      }
      return adjustments;
    }

    // ── Single booking path: 'package' OR 'partial' (calendar / POST /) ──────
    if (!booking.customer_package_id ||
        (pre.payment_status !== 'package' && pre.payment_status !== 'partial')) {
      return adjustments;
    }

    // Per-hour cash rate: prefer the booking's own realized rate, else the
    // service hourly price. Used both to reconstruct a legacy partial's split
    // and to price the new cash leg.
    let serviceHourly = 0;
    try {
      const { rows: svc } = await client.query('SELECT price, duration FROM services WHERE id = $1', [booking.service_id]);
      if (svc.length) {
        const sp = parseFloat(svc[0].price) || 0;
        const sd = parseFloat(svc[0].duration) || 1;
        serviceHourly = sd > 0 ? sp / sd : sp;
      }
    } catch { /* ignore */ }

    const oldFinal = parseFloat(pre.final_amount) || 0;
    const recordedPkg = parseFloat(pre.package_hours_used);
    const recordedCash = parseFloat(pre.cash_hours_used);
    let perHourCash = (Number.isFinite(recordedCash) && recordedCash > 0 && oldFinal > 0)
      ? oldFinal / recordedCash
      : serviceHourly;
    if (!(perHourCash > 0)) perHourCash = serviceHourly;

    // Resolve how many hours the booking currently draws from the package.
    let basePkg;
    if (Number.isFinite(recordedPkg)) {
      basePkg = recordedPkg;
    } else if (pre.payment_status === 'partial' && perHourCash > 0 && oldFinal > 0) {
      basePkg = Math.max(0, oldD - oldFinal / perHourCash); // legacy reconstruction
    } else {
      basePkg = pre.payment_status === 'package' ? oldD : 0;
    }

    // The cash leg to settle against is what the wallet was ACTUALLY charged
    // (net of prior refunds/adjustments), not the recorded final_amount —
    // the two drift apart when a price edit on a 'partial' booking skipped
    // wallet settlement, and refunding the drifted figure shortchanges the
    // customer. Falls back to the recorded amount if the ledger is unreadable.
    let oldCashLeg = pre.payment_status === 'partial' ? oldFinal : 0;
    try {
      const nets = await getEntityNetCharges({ client, bookingId: booking.id, byUser: true });
      const own = nets.find((n) => n.userId === booking.student_user_id &&
        (n.currency || 'EUR') === (booking.currency || 'EUR'));
      // No net row = nothing outstanding on the wallet (already refunded, or
      // the leg was settled outside the wallet) — settle against 0 so we
      // never refund money the ledger doesn't hold.
      oldCashLeg = own && Number.isFinite(own.amount) ? Math.max(0, own.amount) : 0;
    } catch { /* ledger unreadable — keep the recorded fallback */ }

    const res = await applyPackageFirstDelta(client, booking.customer_package_id, basePkg, newD);
    if (res.adjustment?.error === 'insufficient_hours') {
      const err = new Error(`Package has only ${res.adjustment.available}h remaining.`);
      err.status = 400; err.code = 'package_insufficient_hours';
      throw err;
    }
    if (res.adjustment) adjustments.push(res.adjustment);

    const newPkg = res.newPkg;
    const newCash = res.newCash;
    const newCashLeg = parseFloat((newCash * perHourCash).toFixed(2));
    const newPaymentStatus = newPkg <= 0 ? 'paid' : (newCash > 0.0001 ? 'partial' : 'package');

    // For 'package' (cash leg 0) keep final_amount under the cascade's package
    // sync (it writes the lesson value) — UNLESS the booking is flipping from
    // 'partial': final_amount then still holds the stale cash leg, nothing
    // later rewrites it (the package sync only runs on package-level edits),
    // and the booking keeps displaying a cash charge that no longer exists.
    // For 'partial'/'paid', final_amount is the cash leg the customer owes.
    const flippedFromCashLeg = newPaymentStatus === 'package' &&
      (pre.payment_status === 'partial' || oldCashLeg > 0);
    if (flippedFromCashLeg) {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = 0,
            final_amount = 0, amount = 0,
            payment_status = 'package', updated_at = NOW() WHERE id = $2`,
        [newPkg, booking.id]
      );
    } else if (newPaymentStatus === 'package') {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = 0,
            payment_status = 'package', updated_at = NOW() WHERE id = $2`,
        [newPkg, booking.id]
      );
    } else {
      await client.query(
        `UPDATE bookings SET package_hours_used = $1, cash_hours_used = $2,
            final_amount = $3, amount = $3, payment_status = $4, updated_at = NOW()
          WHERE id = $5`,
        [newPkg, newCash, newCashLeg, newPaymentStatus, booking.id]
      );
    }

    // Reflect on the in-memory booking so the post-update refetch / cascade see
    // the reconciled values.
    booking.package_hours_used = newPkg;
    booking.cash_hours_used = newCash;
    booking.payment_status = newPaymentStatus;
    if (newPaymentStatus !== 'package') { booking.final_amount = newCashLeg; booking.amount = newCashLeg; }
    else if (flippedFromCashLeg) { booking.final_amount = 0; booking.amount = 0; }

    // Settle the cash-leg delta on the wallet (single posting point; the cascade
    // skips partial/package). Charge if the customer now owes more, refund if less.
    const cashDelta = parseFloat((newCashLeg - oldCashLeg).toFixed(2));
    if (booking.student_user_id && Math.abs(cashDelta) > 0.009) {
      try {
        await recordWalletTransaction({
          client,
          userId: booking.student_user_id,
          amount: -cashDelta,                 // owe more => debit; owe less => credit
          availableDelta: -cashDelta,
          transactionType: 'booking_charge_adjustment',
          status: 'completed',
          direction: cashDelta > 0 ? 'debit' : 'credit',
          currency: booking.currency || 'EUR',
          description: cashDelta > 0
            ? `Partial lesson cash leg increased: €${Math.abs(cashDelta)}`
            : `Partial lesson cash leg reduced: €${Math.abs(cashDelta)}`,
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          metadata: { reason: 'duration_edit_cash_leg', oldCashLeg, newCashLeg, newPkgHours: newPkg, newCashHours: newCash },
          allowNegative: true,
        });
      } catch (walletErr) {
        logger.warn('Failed to settle partial cash-leg on duration edit', { bookingId: booking.id, error: walletErr.message });
      }
    }

    return adjustments;
  }

// Get available booking slots for a date range
router.get('/available-slots', authenticateJWT, async (req, res) => {
  try {
    // Normalize query params (axios may send instructorIds[])
  const { startDate, endDate } = req.query;
    const rawInstructorIds =
      req.query.instructorIds ??
      req.query['instructorIds[]'] ??
      req.query.instructorId ??
      req.query['instructorId[]'] ??
      null;
    const normalizeIds = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter((s) => s.length > 0);
      if (typeof val === 'string') {
        // support comma-separated or single value
        return val
          .split(',')
          .map((v) => String(v).trim())
          .filter((s) => s.length > 0);
      }
      return [];
    };
    const instructorIdList = normalizeIds(rawInstructorIds);
    
    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: 'Start date and end date are required',
        received: { startDate, endDate }
      });
    }

    // Resolve instructors
    // Priority 1: if explicit instructorIds provided, use those
    // Priority 2: fallback to role lookup (users with role 'instructor')
  const instructorsResult = { rows: [] };
    if (instructorIdList.length > 0) {
      try {
  const placeholders = instructorIdList.map((_, i) => `$${i + 1}`).join(',');
  const q = `SELECT id, name, email FROM users WHERE id IN (${placeholders}) ORDER BY name`;
  const r = await pool.query(q, instructorIdList);
        const foundIds = new Set(r.rows.map((x) => x.id));
        // Add stubs for any ids not in users table so frontend still gets slots
        const stubs = instructorIdList
          .filter((id) => !foundIds.has(id))
          .map((id) => ({ id, name: `Instructor ${id}`, email: null }));
        instructorsResult.rows = [...r.rows, ...stubs];
      } catch (e) {
        logger.error('Failed to fetch instructors by IDs', e);
        // If query by IDs fails, at least provide stubs so calendar works
        instructorsResult.rows = instructorIdList.map((id) => ({ id, name: `Instructor ${id}`, email: null }));
      }
    } else {
      try {
        const instructorsQuery = `
          SELECT u.id, u.name, u.email 
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE LOWER(r.name) IN ('instructor', 'manager') AND u.deleted_at IS NULL
          ORDER BY u.name
        `;
        const r = await pool.query(instructorsQuery);
        instructorsResult.rows = r.rows;
      } catch (instructorError) {
        logger.error('Failed to fetch instructors by role', instructorError);
        instructorsResult.rows = [];
      }
    }

    // If still no instructors, return an empty schedule structure for the date range instead of []
    // so the frontend can optionally show business-hours fallback.
    const noInstructors = instructorsResult.rows.length === 0;

    // Generate time slots for each day in the range
    const result = [];
    const toYMD = (d) => {
      // convert to local-date string YYYY-MM-DD
      const tz = d.getTimezoneOffset();
      const local = new Date(d.getTime() - tz * 60000);
      return local.toISOString().slice(0, 10);
    };
    const addDays = (ymd, days) => {
      const d = new Date(`${ymd}T00:00:00`);
      d.setDate(d.getDate() + days);
      return toYMD(d);
    };
    const { start: whStart, end: whEnd } = await getWorkingHours(pool);
    const generateHalfHourSlots = (startStr, endStr) => {
      const startMins = parseHHMM(startStr);
      const endMins = parseHHMM(endStr);
      const slots = [];
      for (let mins = startMins; mins <= endMins; mins += 30) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
      return slots;
    };
    const standardHours = generateHalfHourSlots(whStart, whEnd);

    // Collect all dates in the range
    const allDates = [];
    {
      let cursor = startDate;
      const last = endDate;
      while (true) {
        allDates.push(cursor);
        if (cursor === last) break;
        cursor = addDays(cursor, 1);
      }
    }

    // BATCH: Fetch all bookings for the entire date range in ONE query (not 1 per day)
    let allBookings = [];
    try {
      let params = [...allDates];
      const datePlaceholders = allDates.map((_, i) => `$${i + 1}`).join(',');
      let bookingsQuery = `
        SELECT 
          date::text AS date,
          instructor_user_id,
          start_hour,
          duration,
          status
        FROM bookings 
        WHERE date IN (${datePlaceholders}) AND deleted_at IS NULL AND status NOT IN ('cancelled', 'pending_payment')
      `;
      if (!noInstructors && instructorIdList.length > 0) {
        const instrPlaceholders = instructorIdList.map((_, i) => `$${allDates.length + i + 1}`).join(',');
        bookingsQuery += ` AND instructor_user_id IN (${instrPlaceholders})`;
        params = [...allDates, ...instructorIdList];
      }
      bookingsQuery += ' ORDER BY date, instructor_user_id, start_hour';
      const bookingsResult = await pool.query(bookingsQuery, params);
      allBookings = bookingsResult.rows;
    } catch (bookingError) {
      logger.error('Failed to fetch bookings for date range', bookingError);
    }

    // Fetch approved availability blocks for the date range
    const unavailableByInstructor = new Map(); // instructorId → Set<dateString>
    try {
      const availResult = await pool.query(
        `SELECT instructor_id::text, start_date::text, end_date::text
         FROM instructor_availability
         WHERE status = 'approved' AND start_date <= $2::date AND end_date >= $1::date`,
        [startDate, endDate]
      );
      for (const row of availResult.rows) {
        if (!unavailableByInstructor.has(row.instructor_id)) {
          unavailableByInstructor.set(row.instructor_id, new Set());
        }
        // Expand date range
        const cursor = new Date(`${row.start_date}T00:00:00Z`);
        const last = new Date(`${row.end_date}T00:00:00Z`);
        while (cursor <= last) {
          unavailableByInstructor.get(row.instructor_id).add(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    } catch (availError) {
      logger.error('Failed to fetch instructor availability for slots', availError);
    }

    // Index bookings by date → instructor → booked time slots
    const bookingsByDate = new Map();
    for (const booking of allBookings) {
      const dateStr = booking.date;
      if (!bookingsByDate.has(dateStr)) {
        bookingsByDate.set(dateStr, new Map());
      }
      const dayMap = bookingsByDate.get(dateStr);
      const instructorId = booking.instructor_user_id;
      if (!dayMap.has(instructorId)) {
        dayMap.set(instructorId, new Set());
      }

      const startHourDecimal = parseFloat(booking.start_hour);
      const durationDecimal = parseFloat(booking.duration) || 1;
      const startHour = Math.floor(startHourDecimal);
      const startMinute = Math.round((startHourDecimal - startHour) * 60);
      const startTimeMinutes = startHour * 60 + startMinute;
      const durationMinutes = durationDecimal * 60;
      const endTimeMinutes = startTimeMinutes + durationMinutes;

      for (let currentMinutes = startTimeMinutes; currentMinutes < endTimeMinutes; currentMinutes += 30) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        dayMap.get(instructorId).add(timeSlot);
      }
    }

    // Build result from pre-indexed data (no more DB calls)
    for (const dateStr of allDates) {
      const dayMap = bookingsByDate.get(dateStr) || new Map();
      const daySlots = [];
      
      for (const instructor of (noInstructors ? [] : instructorsResult.rows)) {
        const instructorBookedSlots = dayMap.get(instructor.id) || new Set();
        const isInstructorUnavailable = unavailableByInstructor.has(instructor.id) &&
          unavailableByInstructor.get(instructor.id).has(dateStr);

        for (const time of standardHours) {
          let status;
          if (isInstructorUnavailable) {
            status = 'unavailable';
          } else if (instructorBookedSlots.has(time)) {
            status = 'booked';
          } else {
            status = 'available';
          }

          daySlots.push({
            time,
            status,
            instructorId: instructor.id,
            instructorName: instructor.name,
            date: dateStr
          });
        }
      }
      
      result.push({
        date: dateStr,
        slots: daySlots
      });
    }
    
  // If no instructors, still respond with the date structure but empty slots array
  res.json(result);
    
  } catch (error) {
    logger.error('Failed to fetch available slots', error);
    
    res.status(500).json({
      error: 'Failed to fetch available slots',
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9)
    });
  }
});

// GET all bookings with optional filter by user_id, role, date range
// GET /bookings - Fetch bookings WITHOUT caching for real-time updates
router.get('/', 
  authenticateJWT,
  // Removed cacheMiddleware to ensure fresh data is always returned
  async (req, res) => {
  try {
  const { student_id, instructor_id, start_date, end_date, status, service_type } = req.query;
  const DEBUG = req.query._debug === '1' || process.env.DEBUG_BOOKINGS === '1';

  const rawRole = req.user.role || '';
  const userRole = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;
  const userID = req.user.id;
  const canFilterByInstructor = ['admin', 'manager', 'instructor'].includes(userRole);
  const limitedRoles = new Set(['student', 'freelancer']);
    
    let query = `
      SELECT b.*,
        s.name as student_name,
        i.name as instructor_name,
        srv.name as service_name,
        srv.category as service_category,
        srv.service_type as service_type,
        srv.duration as service_duration,
        srv.price as service_price,
        cp.package_name as customer_package_name,
        cp.package_name,
        cp.total_hours as package_total_hours,
        (COALESCE(cp.purchase_price, 0) - COALESCE(d_pkg.amount, 0)) as package_price,
        (SELECT COALESCE(SUM(amount), 0) FROM discounts
           WHERE entity_type = 'booking' AND entity_id = b.id::text) as total_discount_amount,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN COALESCE(idc.self_student_commission_rate, 45) END,
          bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value
        ) as instructor_commission,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN 'percentage' END,
          bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
        ) as commission_type,
        t.id as transaction_id,
        creator.name as created_by_name,
        creator.email as created_by_email,
        updater.name as updated_by_name,
        updater.email as updated_by_email,
        CASE 
          WHEN t.id IS NOT NULL THEN 'Individual Payment'
          WHEN b.payment_status = 'package' AND cp.package_name IS NOT NULL THEN cp.package_name
          WHEN b.payment_status = 'package' THEN 'Package Hours'
          WHEN b.payment_status = 'paid' AND b.amount > 0 THEN 'Individual Payment'
          WHEN b.payment_status = 'paid' AND (b.amount = 0 OR b.amount IS NULL) THEN 'Package Hours'
          WHEN s.balance >= COALESCE(b.final_amount, b.amount, 0) AND COALESCE(b.final_amount, b.amount, 0) > 0 THEN 
            CONCAT('€-', COALESCE(b.final_amount, b.amount, 0))
          ELSE 'Paid'
        END as payment_method_display,
        COALESCE(
          json_agg(
            CASE 
              WHEN bp.user_id IS NOT NULL THEN 
                json_build_object(
                  'userId', bp.user_id,
                  'userName', pu.name,
                  'userEmail', pu.email,
                  'userPhone', pu.phone,
                  'isPrimary', bp.is_primary,
                  'paymentStatus', bp.payment_status,
                  'paymentAmount', bp.payment_amount,
                  'customerPackageId', bp.customer_package_id,
                  'notes', bp.notes
                )
              ELSE NULL
            END
          ) FILTER (WHERE bp.user_id IS NOT NULL),
          '[]'::json
        ) as participants
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN discounts d_pkg ON d_pkg.entity_type = 'customer_package' AND d_pkg.entity_id = cp.id::text
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = (
        CASE
          WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
            THEN 'semi-private-supervision'
          ELSE srv.lesson_category_tag
        END
      )
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
  LEFT JOIN wallet_transactions t ON t.booking_id = b.id AND t.transaction_type IN ('charge', 'booking_charge')
      LEFT JOIN booking_participants bp ON bp.booking_id = b.id
      LEFT JOIN users pu ON bp.user_id = pu.id
      LEFT JOIN users creator ON creator.id = b.created_by
      LEFT JOIN users updater ON updater.id = b.updated_by
      WHERE b.deleted_at IS NULL AND b.status != 'pending_payment'
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (student_id) {
      const p1 = `$${paramCount++}`;
      const p2 = `$${paramCount++}`;
      const p3 = `$${paramCount++}`;
      query += ` AND ( 
        b.student_user_id = ${p1}
        OR b.customer_user_id = ${p2}
        OR EXISTS (
          SELECT 1 FROM booking_participants bp2
          WHERE bp2.booking_id = b.id AND bp2.user_id = ${p3}
        )
      )`;
      params.push(student_id, student_id, student_id);
    }

    if (!student_id && limitedRoles.has(userRole)) {
      const p1 = `$${paramCount++}`;
      const p2 = `$${paramCount++}`;
      const p3 = `$${paramCount++}`;
      query += ` AND ( 
        b.student_user_id = ${p1}
        OR b.customer_user_id = ${p2}
        OR EXISTS (
          SELECT 1 FROM booking_participants bp2
          WHERE bp2.booking_id = b.id AND bp2.user_id = ${p3}
        )
      )`;
      params.push(userID, userID, userID);
    }

    if (instructor_id && canFilterByInstructor) {
      query += ` AND b.instructor_user_id = $${paramCount++}`;
      params.push(instructor_id);
    }
    
    if (start_date) {
      query += ` AND b.date >= $${paramCount++}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND b.date <= $${paramCount++}`;
      params.push(end_date);
    }
    
    if (status) {
      query += ` AND b.status = $${paramCount++}`;
      params.push(status);
    }

    // Filter by service type (rental, lesson, accommodation) — matches against service category/type/name
    if (service_type) {
      const st = service_type.toLowerCase();
      if (st === 'rental') {
        query += ` AND (LOWER(srv.category) LIKE '%rental%' OR LOWER(srv.service_type) LIKE '%rental%' OR LOWER(srv.name) LIKE '%rental%' OR LOWER(srv.name) LIKE '%equipment%')`;
      } else if (st === 'accommodation') {
        query += ` AND (LOWER(srv.category) LIKE '%accommodation%' OR LOWER(srv.service_type) LIKE '%accommodation%' OR LOWER(srv.name) LIKE '%accommodation%')`;
      } else if (st === 'lesson') {
        query += ` AND NOT (LOWER(COALESCE(srv.category,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.service_type,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.name,'')) LIKE '%rental%' OR LOWER(COALESCE(srv.category,'')) LIKE '%accommodation%' OR LOWER(COALESCE(srv.service_type,'')) LIKE '%accommodation%')`;
      }
    }
    
    query += ` GROUP BY b.id, b.student_user_id, b.instructor_user_id, b.service_id, b.customer_package_id, b.created_by, b.updated_by, b.date, b.start_hour, b.duration, b.group_size, b.status, b.payment_status, b.final_amount, b.amount, b.created_at, b.updated_at, b.notes, b.deleted_at, s.name, s.balance, s.self_student_of_instructor_id, i.name, srv.name, srv.category, srv.service_type, srv.duration, srv.price, cp.package_name, cp.total_hours, cp.purchase_price, d_pkg.amount, bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, idc.self_student_commission_rate, t.id, creator.name, creator.email, updater.name, updater.email
               ORDER BY b.date DESC
               LIMIT $${paramCount++}`;
    
    // Safety cap: prevent unbounded result sets (default 5000, max 10000)
    const limit = Math.min(parseInt(req.query.limit) || 5000, 10000);
    params.push(limit);
    
    if (DEBUG) {
      try {
        logger.info('[DEBUG]/bookings query about to run', {
          student_id: student_id || null,
          instructor_id: instructor_id || null,
          start_date: start_date || null,
          end_date: end_date || null,
          status: status || null,
          userRole,
          userID,
          paramCount,
        });
      } catch {}
    }

    const { rows } = await pool.query(query, params);

    if (DEBUG && Array.isArray(rows)) {
      try {
        const sid = student_id;
        const total = rows.length;
        let primaryMatches = 0;
        let participantMatches = 0;
        const matchedSamples = [];
        for (const r of rows) {
          const isPrimary = sid && (r.student_user_id === sid || r.customer_user_id === sid);
          const hasParticipants = Array.isArray(r.participants) && r.participants.length > 0;
          const isParticipant = sid && hasParticipants && r.participants.some(p => p && p.userId === sid);
          if (isPrimary) primaryMatches++;
          if (isParticipant) participantMatches++;
          if ((isPrimary || isParticipant) && matchedSamples.length < 5) {
            matchedSamples.push({ id: r.id, date: r.formatted_date || r.date, start_hour: r.start_hour, reason: isPrimary ? 'primary/legacy' : 'participant' });
          }
        }
        logger.info('[DEBUG]/bookings rows fetched', {
          total,
          primaryMatches,
          participantMatches,
          sample: matchedSamples,
        });
      } catch {}
    }
    
    // Ensure dates are consistently formatted for frontend
    const normalizedBookings = rows.map(booking => {
      // Convert start_hour to startTime and calculate endTime
      let startTime = null;
      let endTime = null;
      
      if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
        const startHourFloat = parseFloat(booking.start_hour);
        
        // Add safety check for valid start hour
        if (isNaN(startHourFloat) || startHourFloat < 0 || startHourFloat > 24) {
          logger.warn('Invalid start_hour detected', { booking_id: booking.id, start_hour: booking.start_hour });
          return {
            ...booking,
            date: booking.formatted_date || booking.date,
            startTime: null,
            endTime: null,
            time: null
          };
        }

        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);

        // Additional safety check for calculated values
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          logger.warn('Invalid calculated time values', { hours, minutes, start_hour: startHourFloat });
          return {
            ...booking,
            date: booking.formatted_date || booking.date,
            startTime: null,
            endTime: null,
            time: null
          };
        }
        
        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate end time based on duration
        let _duration = parseFloat(booking.duration);
        if (isNaN(_duration) || _duration <= 0) {
          _duration = 1; // Default 1 hour
        }
        const endHourFloat = startHourFloat + _duration;
        const endHours = Math.floor(endHourFloat);
        const endMinutes = Math.round((endHourFloat - endHours) * 60);
        
        // Safety check for end time calculation
        if (isNaN(endHours) || isNaN(endMinutes)) {
          logger.warn('Invalid end time calculation', { endHours, endMinutes });
          endTime = null;
        } else {
          endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
        }
      }
      
      // Replace the date field with the consistently formatted date and add time fields
      return {
        ...booking,
        date: booking.formatted_date || booking.date,
        startTime,
        endTime,
        time: startTime, // For backward compatibility
        // Map backend field names to frontend expected names
        serviceName: booking.service_name,
        userName: booking.student_name,
        studentName: booking.student_name,
        instructorName: booking.instructor_name,
        // Keep original fields for compatibility
        instructorId: booking.instructor_user_id,
        studentId: booking.student_user_id || booking.customer_user_id,
        serviceId: booking.service_id,
        // Add payment method information
        paymentMethod: booking.payment_method_display,
        isPackagePayment: booking.payment_method_display === 'Package Hours',
        // Normalize audit fields to camelCase
        createdBy: booking.created_by,
        createdByName: booking.created_by_name,
        createdByEmail: booking.created_by_email,
        createdAt: booking.created_at,
        updatedBy: booking.updated_by,
        updatedByName: booking.updated_by_name,
        updatedByEmail: booking.updated_by_email,
        updatedAt: booking.updated_at
      };
    });
    
    res.json(normalizedBookings);
  } catch (err) {
    logger.error('Failed to fetch bookings', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET calendar bookings for a specific date (must be before /:id route)
router.get('/calendar', authenticateJWT, cacheMiddleware(60, (req) => `api:bookings:calendar:${req.query.date || 'all'}:${req.query.instructor_id || 'all'}`), async (req, res) => {
  try {
    const { date, instructor_id } = req.query;
    
    let query = `
      SELECT b.*,
        s.name as student_name,
        i.name as instructor_name,
        srv.name as service_name,
        TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date,
        cp.package_name,
        cp.total_hours as package_total_hours,
        (COALESCE(cp.purchase_price, 0) - COALESCE(d_pkg.amount, 0)) as package_price,
        (SELECT COALESCE(SUM(amount), 0) FROM discounts
           WHERE entity_type = 'booking' AND entity_id = b.id::text) as total_discount_amount,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN COALESCE(idc.self_student_commission_rate, 45) END,
          bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value
        ) as instructor_commission,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN 'percentage' END,
          bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
        ) as commission_type,
        COALESCE(
          json_agg(
            CASE
              WHEN bp.user_id IS NOT NULL THEN
                json_build_object(
                  'userId', bp.user_id,
                  'userName', pu.name,
                  'userEmail', pu.email,
                  'userPhone', pu.phone,
                  'isPrimary', bp.is_primary,
                  'paymentStatus', bp.payment_status,
                  'paymentAmount', bp.payment_amount,
                  'customerPackageId', bp.customer_package_id,
                  'notes', bp.notes
                )
              ELSE NULL
            END
          ) FILTER (WHERE bp.user_id IS NOT NULL),
          '[]'::json
        ) as participants
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN discounts d_pkg ON d_pkg.entity_type = 'customer_package' AND d_pkg.entity_id = cp.id::text
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = (
        CASE
          WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
            THEN 'semi-private-supervision'
          ELSE srv.lesson_category_tag
        END
      )
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      LEFT JOIN booking_participants bp ON bp.booking_id = b.id
      LEFT JOIN users pu ON bp.user_id = pu.id
      WHERE b.deleted_at IS NULL AND b.status != 'pending_payment'
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by date if provided
    if (date) {
      query += ` AND b.date = $${paramCount++}`;
      params.push(date);
    }
    
    // Filter by instructor if provided
    if (instructor_id) {
      query += ` AND b.instructor_user_id = $${paramCount++}`;
      params.push(instructor_id);
    }
    
    query += ` GROUP BY b.id, b.student_user_id, b.instructor_user_id, b.service_id, b.date, b.start_hour, b.duration, b.group_size, b.status, b.payment_status, b.final_amount, b.created_at, b.updated_at, b.notes, b.deleted_at, s.name, s.self_student_of_instructor_id, i.name, srv.name, cp.package_name, cp.total_hours, cp.purchase_price, d_pkg.amount, bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, idc.self_student_commission_rate`;
    query += ` ORDER BY b.start_hour ASC`;
    
    const { rows } = await pool.query(query, params);
    
    // Convert bookings to frontend format with time strings
    const calendarBookings = rows.map(booking => {
      let startTime = null;
      let endTime = null;
      
      if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
        const startHourFloat = parseFloat(booking.start_hour);
        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);
        startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate end time
        const duration = parseFloat(booking.duration) || 1;
        const endHourFloat = startHourFloat + duration;
        const endHours = Math.floor(endHourFloat);
        const endMinutes = Math.round((endHourFloat - endHours) * 60);
        endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
      }
      
      return {
        ...booking,
        date: booking.formatted_date || booking.date,
        start_time: startTime,
        end_time: endTime,
        startTime,
        endTime
      };
    });
    
    res.json(calendarBookings);
  } catch (err) {
    logger.error('Failed to fetch calendar bookings', err);
    res.status(500).json({ error: 'Failed to fetch calendar bookings' });
  }
});

/**
 * GET /bookings/preferred-instructor
 * Returns the instructor the current student has had the most recent lesson with.
 */
router.get('/preferred-instructor', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT b.instructor_user_id
       FROM bookings b
       WHERE b.deleted_at IS NULL
         AND b.instructor_user_id IS NOT NULL
         AND (b.student_user_id = $1 OR b.customer_user_id = $1
              OR EXISTS (SELECT 1 FROM booking_participants bp WHERE bp.booking_id = b.id AND bp.user_id = $1))
       ORDER BY b.date DESC, b.start_hour DESC
       LIMIT 1`,
      [userId]
    );
    res.json({ instructorId: result.rows[0]?.instructor_user_id || null });
  } catch (error) {
    logger.error('Error fetching preferred instructor', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch preferred instructor' });
  }
});

/**
 * GET /bookings/pending-partner-invites
 * Returns pending_partner bookings where the current user is a non-primary participant.
 * Must be defined BEFORE /:id to avoid Express matching "pending-partner-invites" as an ID.
 */
router.get('/pending-partner-invites', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT b.id AS "bookingId",
              b.date, b.start_hour, b.duration,
              s.name AS "serviceName",
              COALESCE(NULLIF(TRIM(u.name), ''), TRIM(CONCAT(u.first_name, ' ', u.last_name))) AS "bookerName",
              cp.remaining_hours AS "packageRemainingHours"
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN users u ON u.id = b.student_user_id
       LEFT JOIN booking_participants bp2 ON bp2.booking_id = b.id AND bp2.user_id = $1
       LEFT JOIN customer_packages cp ON cp.id = bp2.customer_package_id
       WHERE b.status = 'pending_partner'
         AND bp.user_id = $1
         AND bp.is_primary = false
         AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [userId]
    );

    const invites = result.rows.map(row => ({
      bookingId: row.bookingId,
      bookerName: row.bookerName || 'Your friend',
      serviceName: row.serviceName || 'Group Lesson',
      date: row.date,
      startTime: row.start_hour != null
        ? `${String(Math.floor(Number(row.start_hour))).padStart(2, '0')}:${String(Math.round((Number(row.start_hour) % 1) * 60)).padStart(2, '0')}`
        : null,
      duration: parseFloat(row.duration) || 1,
      packageRemainingHours: row.packageRemainingHours != null ? parseFloat(row.packageRemainingHours) : null,
    }));

    res.json({ invites });
  } catch (error) {
    logger.error('Error fetching pending partner invites', { error: error?.message });
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

/**
 * GET /bookings/pending-transfers
 * Admin/Staff route to fetch all pending bank transfer receipts
 */
router.get('/pending-transfers', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner', 'staff']), async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    
    const query = `
      SELECT r.*,
             u.first_name, u.last_name, u.email,
             b.service_id, b.date as booking_date, b.start_hour, b.duration,
             cp.package_name, cp.lesson_service_name, cp.total_hours, cp.used_hours, cp.remaining_hours,
             ba.bank_name, ba.iban, ba.currency as bank_currency,
             so.order_number as shop_order_number, so.total_amount as shop_order_total,
             so.status as shop_order_status, so.deposit_percent as shop_deposit_percent,
             so.deposit_amount as shop_deposit_amount
      FROM bank_transfer_receipts r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN bookings b ON r.booking_id = b.id
      LEFT JOIN customer_packages cp ON r.customer_package_id = cp.id
      LEFT JOIN wallet_bank_accounts ba ON r.bank_account_id = ba.id
      LEFT JOIN shop_orders so ON r.shop_order_id = so.id
      WHERE r.status = $1
        AND r.accommodation_booking_id IS NULL
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `SELECT COUNT(*) FROM bank_transfer_receipts WHERE status = $1 AND accommodation_booking_id IS NULL`;
    
    const [result, countResult] = await Promise.all([
      pool.query(query, [status, limit, offset]),
      pool.query(countQuery, [status])
    ]);

    const rows = result.rows;

    // For package receipts, fetch the lessons booked under each package
    const packageIds = rows
      .filter(r => r.customer_package_id)
      .map(r => r.customer_package_id);

    let packageBookingsMap = {};
    if (packageIds.length > 0) {
      const uniqueIds = [...new Set(packageIds)];
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
      const bookingsRes = await pool.query(`
        SELECT bk.id, bk.date, bk.start_hour, bk.duration, bk.status, bk.payment_status,
               bk.customer_package_id,
               srv.name as service_name,
               i.name as instructor_name
        FROM bookings bk
        LEFT JOIN services srv ON srv.id = bk.service_id
        LEFT JOIN users i ON i.id = bk.instructor_user_id
        WHERE bk.customer_package_id IN (${placeholders})
          AND bk.deleted_at IS NULL
        ORDER BY bk.date ASC, bk.start_hour ASC
      `, uniqueIds);
      for (const bk of bookingsRes.rows) {
        const pkgId = bk.customer_package_id;
        if (!packageBookingsMap[pkgId]) packageBookingsMap[pkgId] = [];
        packageBookingsMap[pkgId].push(bk);
      }
    }

    const enrichedResults = rows.map(r => ({
      ...r,
      package_bookings: r.customer_package_id ? (packageBookingsMap[r.customer_package_id] || []) : [],
    }));
    
    res.json({
      results: enrichedResults,
      pagination: {
        total: parseInt(countResult.rows[0].count, 10),
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    });
  } catch (err) {
    logger.error('Error fetching pending transfers', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch pending transfers' });
  }
});

/**
 * PATCH /bookings/pending-transfers/:id/action
 * Admin explicitly approves or rejects the bank transfer
 */
router.patch('/pending-transfers/:id/action', authenticateJWT, authorizeRoles(['admin', 'manager', 'owner']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, reviewerNotes } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    
    await client.query('BEGIN');
    
    const receiptRes = await client.query(`
      SELECT r.*,
             so.order_number as so_order_number,
             so.deposit_percent as so_deposit_percent,
             so.deposit_amount as so_deposit_amount,
             so.total_amount as so_total_amount
      FROM bank_transfer_receipts r
      LEFT JOIN shop_orders so ON r.shop_order_id = so.id
      WHERE r.id = $1
      FOR UPDATE OF r
    `, [id]);
    if (receiptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = receiptRes.rows[0];
    if (receipt.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Receipt is already ${receipt.status}` });
    }
    
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    await client.query(
      `UPDATE bank_transfer_receipts 
       SET status = $1, notes = CONCAT(notes, ' | Reviewer Note: ', $2::text), updated_at = NOW() 
       WHERE id = $3`,
      [newStatus, reviewerNotes || '', id]
    );
    
    if (newStatus === 'approved') {
      const paymentAmount = parseFloat(receipt.amount) || 0;
      const paymentCurrency = receipt.currency || 'EUR';

      if (receipt.booking_id) {
        await client.query(
          `UPDATE bookings 
           SET payment_status = 'paid', status = 'confirmed', updated_at = NOW() 
           WHERE id = $1`,
          [receipt.booking_id]
        );
        logger.info('Standalone booking confirmed via bank transfer approval', { bookingId: receipt.booking_id, receiptId: id });

        // Record wallet ledger entries so the payment appears in financial history
        // Insert debit first, then credit — credit gets the later timestamp and appears
        // first in the DESC-sorted financial history (payment received → then charged)
        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'booking_charge',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: `Lesson Booking Charge (Bank Transfer)`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'booking',
              relatedEntityId: receipt.booking_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: `Bank Transfer Payment Received (Lesson)`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'booking',
              relatedEntityId: receipt.booking_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record bank transfer wallet ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }

        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Payment Approved', message: 'Your bank transfer was approved and lesson confirmed!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      } else if (receipt.customer_package_id) {
        await client.query(
          `UPDATE customer_packages 
           SET status = 'active'
           WHERE id = $1`,
           [receipt.customer_package_id]
        );
        logger.info('Package activated via bank transfer approval', { pkgId: receipt.customer_package_id, receiptId: id });
        
        // Confirm all bookings under this package (match both pending_payment and waiting_payment)
        const confirmedBookings = await client.query(
          `UPDATE bookings 
           SET payment_status = 'package', status = 'confirmed', updated_at = NOW() 
           WHERE customer_package_id = $1 
             AND (status = 'pending_payment' OR payment_status IN ('pending_payment', 'waiting_payment'))
           RETURNING id`,
          [receipt.customer_package_id]
        );
        logger.info('Confirmed bookings via bank transfer approval', {
          pkgId: receipt.customer_package_id,
          confirmedCount: confirmedBookings.rows.length,
        });

        // Fetch package name for the ledger description
        const pkgInfo = await client.query(
          `SELECT package_name FROM customer_packages WHERE id = $1`,
          [receipt.customer_package_id]
        );
        const pkgName = pkgInfo.rows[0]?.package_name || 'Package';

        // Record wallet ledger entries: debit first, then credit
        // Credit gets the later timestamp → appears first in DESC-sorted history
        // So users see: "Payment Received" then "Package Charge" (logical order)
        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'package_purchase',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: `Package Purchase (Bank Transfer): ${pkgName}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'customer_package',
              relatedEntityId: receipt.customer_package_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, packageName: pkgName, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: `Bank Transfer Payment Received: ${pkgName}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'customer_package',
              relatedEntityId: receipt.customer_package_id,
              createdBy: req.user?.id,
              metadata: { receiptId: id, packageName: pkgName, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record bank transfer package wallet ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }
        
        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Package Activated', message: 'Your bank transfer was approved and package is now active!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      } else if (receipt.shop_order_id) {
        // Shop order bank transfer approval — shop_order data already joined in the receipt SELECT above
        const isDeposit = parseFloat(receipt.so_deposit_percent || 0) > 0;
        const newPaymentStatus = isDeposit ? 'deposit_paid' : 'completed';

        await client.query(
          `UPDATE shop_orders SET payment_status = $2, status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [receipt.shop_order_id, newPaymentStatus]
        );
        await client.query(
          `INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, 'pending', 'confirmed', $2, $3)`,
          [receipt.shop_order_id, req.user?.id, isDeposit
            ? `Deposit ${receipt.so_deposit_percent}% bank transfer approved by admin`
            : 'Bank transfer approved by admin']
        );
        logger.info('Shop order confirmed via bank transfer approval', { shopOrderId: receipt.shop_order_id, receiptId: id });

        if (paymentAmount > 0) {
          try {
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: -paymentAmount,
              transactionType: 'payment',
              status: 'completed',
              direction: 'debit',
              availableDelta: 0,
              description: isDeposit
                ? `Shop Deposit (Bank Transfer): Order #${receipt.so_order_number}`
                : `Shop Order Payment (Bank Transfer): Order #${receipt.so_order_number}`,
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'shop_order',
              relatedEntityId: String(receipt.shop_order_id),
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
            await recordWalletTransaction({
              userId: receipt.user_id,
              amount: paymentAmount,
              transactionType: 'bank_transfer_payment',
              status: 'completed',
              direction: 'credit',
              availableDelta: 0,
              description: 'Bank Transfer Payment Received (Shop)',
              currency: paymentCurrency,
              paymentMethod: 'bank_transfer',
              relatedEntityType: 'shop_order',
              relatedEntityId: String(receipt.shop_order_id),
              createdBy: req.user?.id,
              metadata: { receiptId: id, source: 'bank_transfer_approval' },
              client,
            });
          } catch (ledgerErr) {
            logger.warn('Failed to record shop order bank transfer ledger entries', { error: ledgerErr.message, receiptId: id });
          }
        }

        try {
          req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
            notification: { title: 'Order Confirmed', message: 'Your bank transfer was approved and your shop order is confirmed!', type: 'success' }
          });
        } catch (e) { /* ignore */ }
      }
    } else {
      if (receipt.booking_id) {
        await client.query(
          `UPDATE bookings SET payment_status = 'failed', status = 'cancelled', notes = CONCAT(notes, ' | Payment Rejected'), updated_at = NOW() WHERE id = $1`,
          [receipt.booking_id]
        );
        await clearInstructorEarningsForBooking(client, receipt.booking_id);
        await client.query(
          `UPDATE manager_commissions
              SET status = 'cancelled',
                  notes = COALESCE(notes || ' | ', '') || 'Cancelled: Bank transfer rejected',
                  updated_at = NOW()
            WHERE source_type = 'booking' AND source_id = $1 AND status = 'pending'`,
          [String(receipt.booking_id)]
        );
      } else if (receipt.customer_package_id) {
        await client.query(
          `UPDATE customer_packages SET status = 'expired', notes = CONCAT(notes, ' | Payment Rejected') WHERE id = $1`,
          [receipt.customer_package_id]
        );
        // Only cancel bookings that haven't been delivered: a COMPLETED lesson
        // keeps its history, earnings and commission — rejecting a transfer must
        // not retro-cancel taught lessons. For the bookings we do cancel, clear
        // the unpaid earnings snapshot and cancel the pending commission so
        // nothing stays stranded on a cancelled source.
        const { rows: cancelledByPkg } = await client.query(
          `UPDATE bookings
              SET payment_status = 'failed', status = 'cancelled',
                  canceled_at = NOW(), updated_at = NOW()
            WHERE customer_package_id = $1
              AND deleted_at IS NULL
              AND status NOT IN ('cancelled', 'completed', 'done', 'checked_out', 'no_show')
            RETURNING id`,
          [receipt.customer_package_id]
        );
        for (const b of cancelledByPkg) {
          await clearInstructorEarningsForBooking(client, b.id);
          await client.query(
            `UPDATE manager_commissions
                SET status = 'cancelled',
                    notes = COALESCE(notes || ' | ', '') || 'Cancelled: Bank transfer rejected',
                    updated_at = NOW()
              WHERE source_type = 'booking' AND source_id = $1 AND status = 'pending'`,
            [String(b.id)]
          );
        }
      } else if (receipt.shop_order_id) {
        // Restore stock and cancel the order on rejection
        const orderItemsRes = await client.query(
          'SELECT product_id, quantity FROM shop_order_items WHERE order_id = $1',
          [receipt.shop_order_id]
        );
        for (const item of orderItemsRes.rows) {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }
        await client.query(
          `UPDATE shop_orders SET status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [receipt.shop_order_id]
        );
        await client.query(
          `INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
           VALUES ($1, 'pending', 'cancelled', $2, $3)`,
          [receipt.shop_order_id, req.user?.id, `Bank transfer rejected by admin: ${reviewerNotes || 'No notes'}`]
        );
        logger.info('Shop order cancelled due to bank transfer rejection', { shopOrderId: receipt.shop_order_id, receiptId: id });
      }

      try {
        req.socketService?.emitToChannel(`user:${receipt.user_id}`, 'notification:new', {
          notification: { title: 'Bank Transfer Rejected', message: `Your bank transfer was rejected: ${reviewerNotes || 'No notes left'}`, type: 'error' }
        });
      } catch (e) { /* ignore */ }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: `Receipt ${newStatus} successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error processing bank transfer receipt', { error: err.message });
    res.status(500).json({ error: 'Failed to process action' });
  } finally {
    client.release();
  }
});

// GET a single booking by ID
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, 
        s.name as student_name,
        s.email as student_email,
        i.name as instructor_name,
        i.email as instructor_email,
        srv.name as service_name,
        srv.price as service_price,
        srv.category as service_category,
        cp.package_name,
        cp.total_hours as package_total_hours,
        (COALESCE(cp.purchase_price, 0) - COALESCE(d_pkg.amount, 0)) as package_price,
        (SELECT COALESCE(SUM(amount), 0) FROM discounts
           WHERE entity_type = 'booking' AND entity_id = b.id::text) as total_discount_amount,
        -- D4: subtract the booking-level discount so display_amount matches the
        -- detail drawer (BookingDetailModal.getDisplayPrice) and the list view,
        -- instead of showing the pre-discount price on this surface only.
        GREATEST(COALESCE(b.final_amount, b.amount, srv.price, 0) - (
          SELECT COALESCE(SUM(amount), 0) FROM discounts
           WHERE entity_type = 'booking' AND entity_id = b.id::text), 0) as display_amount,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN COALESCE(idc.self_student_commission_rate, 45) END,
          bcc.commission_value, isc.commission_value, icr.rate_value, idc.commission_value, 0
        ) as instructor_commission,
        COALESCE(
          CASE WHEN s.self_student_of_instructor_id = b.instructor_user_id
               THEN 'percentage' END,
          bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
        ) as commission_type
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      LEFT JOIN users i ON i.id = b.instructor_user_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN discounts d_pkg ON d_pkg.entity_type = 'customer_package' AND d_pkg.entity_id = cp.id::text
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = (
        CASE
          WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
            THEN 'semi-private-supervision'
          ELSE srv.lesson_category_tag
        END
      )
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.id = $1 AND b.deleted_at IS NULL
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Get equipment for this booking
    const equipmentResult = await pool.query(`
      SELECT e.*
      FROM booking_equipment be
      JOIN equipment e ON e.id = be.equipment_id
      WHERE be.booking_id = $1
    `, [req.params.id]);
      const booking = rows[0];
    booking.equipment = equipmentResult.rows;    // Convert start_hour to startTime and calculate endTime for single booking
    if (booking.start_hour !== undefined && booking.start_hour !== null && !isNaN(booking.start_hour)) {
      const startHourFloat = parseFloat(booking.start_hour);
      
      // Add safety check for valid start hour
      if (isNaN(startHourFloat) || startHourFloat < 0 || startHourFloat > 24) {
        logger.warn('Invalid start_hour detected in single booking', { booking_id: booking.id, start_hour: booking.start_hour });
        booking.startTime = null;
        booking.endTime = null;
        booking.time = null;
      } else {
        const hours = Math.floor(startHourFloat);
        const minutes = Math.round((startHourFloat - hours) * 60);
        
        // Additional safety check for calculated values
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          logger.warn('Invalid calculated time values for single booking', { hours, minutes, start_hour: startHourFloat });
          booking.startTime = null;
          booking.endTime = null;
          booking.time = null;
        } else {
          booking.startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          
          // Calculate end time based on duration
          let _duration = parseFloat(booking.duration);
          if (isNaN(_duration) || _duration <= 0) {
            _duration = 1; // Default 1 hour
          }
          const endHourFloat = startHourFloat + _duration;
          const endHours = Math.floor(endHourFloat);
          const endMinutes = Math.round((endHourFloat - endHours) * 60);
          
          // Safety check for end time calculation
          if (isNaN(endHours) || isNaN(endMinutes)) {
            logger.warn('Invalid end time calculation for single booking', { endHours, endMinutes });
            booking.endTime = null;
          } else {
            booking.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
          }
          
          booking.time = booking.startTime; // For backward compatibility
        }
      }
    }
    
    res.json(booking);
  } catch (err) {
    logger.error('Failed to fetch booking', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// CREATE a new booking
// POST /bookings - Create booking with proper package/individual lesson logic
router.post('/', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager', 'instructor', 'front_desk', 'student', 'outsider'], 'bookings:write'),
  async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    
    const { 
      date, start_hour, duration, student_user_id, instructor_user_id, 
      status, amount, location, equipment_ids, use_package, service_id,
      voucherId,  // Voucher/promo code to apply
      partner_user_id,  // Optional: group partner's user ID
      partner_customer_package_id  // Optional: group partner's customer_package ID
    } = req.body;
    let walletCurrency = req.body.wallet_currency || req.body.walletCurrency || req.body.currency;
    const requestedPaymentMethod = req.body.payment_method || null;
    let finalNotes = req.body.notes || '';
    
    // If currency not provided, get from customer's preferred_currency (for price lookup)
    if (!walletCurrency && student_user_id) {
      const userCurrencyResult = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [student_user_id]
      );
      walletCurrency = userCurrencyResult.rows[0]?.preferred_currency || DEFAULT_CURRENCY;
    } else if (!walletCurrency) {
      walletCurrency = DEFAULT_CURRENCY;
    }
    // Wallet transactions MUST use the system's storage currency (EUR).
    // preferred_currency is for display/price-lookup only, not for wallet storage.
    const walletTransactionCurrency = DEFAULT_CURRENCY;
    
    // Staff roles automatically allow negative balance (front desk can book even if customer
    // has no balance). Derived purely from req.user.role — req.body.allowNegativeBalance is
    // intentionally NOT honoured so a customer cannot self-overdraft via the wire payload.
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'receptionist', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    // trusted_customer: always allowed to book with insufficient balance — debt is tracked in wallet
    const isTrustedCustomer = req.user?.role === 'trusted_customer';
    const allowNegativeBalance = isStaffBooker || isTrustedCustomer;

    // Staff roles automatically confirm bookings (admin, manager, front_desk)
    const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk', 'receptionist'];
    const shouldAutoConfirm = staffRolesForAutoConfirm.includes(req.user?.role);
    let finalStatus = shouldAutoConfirm ? 'confirmed' : (status || 'pending');
    
    // Validate required fields
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Guard: check instructor availability
    if (instructor_user_id) {
      const availCheck = await client.query(
        `SELECT id FROM instructor_availability
         WHERE instructor_id = $1 AND status = 'approved'
           AND start_date <= $2::date AND end_date >= $2::date
         LIMIT 1`,
        [instructor_user_id, date]
      );
      if (availCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Instructor is unavailable on the selected date' });
      }
    }
    
    const bookingDuration = parseFloat(duration) || 1;
    
    let finalPaymentStatus = 'paid'; // Pay-and-go: default to paid for individual payments
    let finalAmount = parseFloat(amount) || 0;
    let usedPackageId = null;
    let spilloverResult = null; // set when cross-package FIFO consumption runs (non-partner)

    // Fetch service name, capacity limits, and discipline tags
    let bookingServiceName = null;
    let maxParticipants = null;
    let serviceDisciplineTag = null;
    let serviceLessonCategoryTag = null;
    let serviceLevelTag = null;
    let servicePrice = null;
    let serviceDurationHours = null;
    if (service_id) {
      try {
        const sres = await client.query(
          'SELECT name, max_participants, discipline_tag, lesson_category_tag, level_tag, price, duration FROM services WHERE id = $1',
          [service_id]
        );
        bookingServiceName = sres.rows[0]?.name || null;
        maxParticipants = sres.rows[0]?.max_participants || null;
        serviceDisciplineTag = sres.rows[0]?.discipline_tag || null;
        serviceLessonCategoryTag = sres.rows[0]?.lesson_category_tag || null;
        serviceLevelTag = sres.rows[0]?.level_tag || null;
        servicePrice = parseFloat(sres.rows[0]?.price) || null;
        serviceDurationHours = parseFloat(sres.rows[0]?.duration) || null;
      } catch {}
    }

    // Auto-resolve amount from service price when not provided
    if (finalAmount === 0 && amount == null && servicePrice > 0 && !use_package) {
      const dur = bookingDuration || 1;
      finalAmount = serviceDurationHours > 0
        ? parseFloat(((servicePrice / serviceDurationHours) * dur).toFixed(2))
        : servicePrice;
    }

    // Validate instructor is qualified for this service's discipline
    const forceSkipSkillCheck = req.query.force === 'true';
    if (instructor_user_id && serviceDisciplineTag && !forceSkipSkillCheck) {
      const skillResult = await client.query(
        `SELECT lesson_categories, max_level FROM instructor_skills
         WHERE instructor_id = $1 AND discipline_tag = $2`,
        [instructor_user_id, serviceDisciplineTag]
      );
      if (skillResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Instructor is not qualified for this discipline',
          details: { discipline: serviceDisciplineTag, instructorId: instructor_user_id }
        });
      }
      const skill = skillResult.rows[0];
      if (serviceLessonCategoryTag && !skill.lesson_categories.includes(serviceLessonCategoryTag)) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: `Instructor is not qualified for ${serviceLessonCategoryTag} lessons in ${serviceDisciplineTag}`,
          details: { discipline: serviceDisciplineTag, category: serviceLessonCategoryTag }
        });
      }
      const levelRank = { beginner: 1, intermediate: 2, advanced: 3 };
      if (serviceLevelTag && (levelRank[skill.max_level] || 1) < (levelRank[serviceLevelTag] || 1)) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: `Instructor max level (${skill.max_level}) is insufficient for ${serviceLevelTag} lessons`,
          details: { discipline: serviceDisciplineTag, requiredLevel: serviceLevelTag, instructorLevel: skill.max_level }
        });
      }
    }
    
    // Check capacity limits for group bookings
    if (maxParticipants !== null && maxParticipants > 0) {
      // Count existing confirmed bookings for this instructor/date/time
      const capacityCheck = await client.query(`
        SELECT COUNT(*) as booking_count
        FROM bookings
        WHERE instructor_user_id = $1
          AND date = $2
          AND start_hour = $3
          AND duration = $4
          AND status IN ('confirmed', 'completed')
          AND deleted_at IS NULL
      `, [instructor_user_id, date, parseFloat(start_hour), parseFloat(bookingDuration)]);
      
      const currentBookings = parseInt(capacityCheck.rows[0]?.booking_count || 0);
      
      if (currentBookings >= maxParticipants) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'capacity_exceeded',
          message: `This time slot is at full capacity (${maxParticipants} participants). Please choose a different time.`,
          maxCapacity: maxParticipants,
          currentBookings
        });
      }
    }
    
    // Check user's choice: use package or pay individually
    if (student_user_id && use_package === true && !partner_user_id) {
      // ── Cross-package FIFO spillover ──────────────────────────────────────
      // Draw hours from the customer's compatible packages oldest-first,
      // spilling into the next package when one runs out, overflowing to cash
      // only when the whole pool is exhausted. The per-package draws are
      // recorded in the ledger right after the booking row is inserted.
      const requestedPackageId = req.body.customer_package_id || req.body.selected_package_id;

      spilloverResult = await consumeAcrossPackages(client, {
        customerId: student_user_id,
        hoursNeeded: parseFloat(bookingDuration),
        matchCriteria: {
          serviceName: bookingServiceName,
          lessonCategoryTag: serviceLessonCategoryTag,
          disciplineTag: serviceDisciplineTag,
        },
        requestedPackageId: requestedPackageId || null,
        asOfDate: date,
      });

      if (spilloverResult.draws.length === 0) {
        // Staff asked to use a package but the customer has no compatible package
        // with hours — keep the historical guard (offer to pay individually).
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Insufficient or mismatched package',
          message: bookingServiceName
            ? `No active ${bookingServiceName} package with hours. Choose a matching package or pay individually.`
            : 'No active package with hours. Choose a package or pay individually.'
        });
      }

      usedPackageId = spilloverResult.primaryPackageId;

      if (spilloverResult.cashHours > 0.0001) {
        // Pool couldn't fully cover the lesson → partial: overflow hours billed
        // as cash at the service's per-hour rate.
        const serviceHourly = serviceDurationHours > 0
          ? (servicePrice || 0) / serviceDurationHours
          : (servicePrice || 0);
        finalPaymentStatus = 'partial';
        finalAmount = parseFloat((spilloverResult.cashHours * serviceHourly).toFixed(2));
      } else {
        // Fully package-funded. Lesson value = Σ(hours × frozen per-hour rate).
        finalPaymentStatus = 'package';
        finalAmount = parseFloat(
          spilloverResult.draws.reduce((s, d) => s + d.hours * d.ratePerHour, 0).toFixed(2)
        );
      }

      // A bank-transfer-pending (waiting_payment) primary package keeps the
      // booking off the confirmed calendar until its receipt is approved.
      if (spilloverResult.primaryOriginalStatus === 'waiting_payment') {
        finalStatus = 'pending_payment';
        finalPaymentStatus = 'pending_payment';
      }
    } else if (student_user_id && use_package === true) {
      // ── LEGACY single-package path (partner bookings pair two single packages
      //    and do not spill over) ─────────────────────────────────────────────

      // Prefer the specific customer_package_id when provided by the frontend
      const requestedPackageId = req.body.customer_package_id || req.body.selected_package_id;
      let packageCheck = { rows: [] };
      
      if (requestedPackageId) {
        // Look up the specifically requested package (validates ownership + active + enough hours)
        const specificParams = [requestedPackageId, student_user_id, parseFloat(bookingDuration)];
        const specificSql = `
          SELECT id, package_name, remaining_hours, total_hours, used_hours, purchase_price, lesson_service_name, status as pkg_status
          FROM customer_packages 
          WHERE id = $1 
            AND customer_id = $2
            AND status IN ('active', 'waiting_payment') 
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $3)
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          LIMIT 1
        `;
        packageCheck = await client.query(specificSql, specificParams);
      }
      
      // Fallback: search by customer_id + service name if no specific package provided or it didn't match
      if (packageCheck.rows.length === 0) {
        const params = [student_user_id, parseFloat(bookingDuration)];
        let sql = `
          SELECT cp.id, cp.package_name, cp.remaining_hours, cp.total_hours, cp.used_hours, cp.purchase_price, cp.lesson_service_name, cp.status as pkg_status
          FROM customer_packages cp
          LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
          WHERE cp.customer_id = $1 
            AND cp.status IN ('active', 'waiting_payment') 
            AND (COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) >= $2)
            AND (COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) > 0)
        `;
        if (bookingServiceName) {
          // Flexible matching: check both customer_packages AND service_packages lesson_service_name
          sql += ` AND (
            cp.lesson_service_name IS NULL 
            OR LOWER(cp.lesson_service_name) = LOWER($3)
            OR LOWER(RTRIM(cp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
            OR LOWER(sp.lesson_service_name) = LOWER($3)
            OR LOWER(RTRIM(sp.lesson_service_name, 's')) = LOWER(RTRIM($3, 's'))
          )`;
          params.push(bookingServiceName);
        }
        sql += ' ORDER BY cp.purchase_date ASC LIMIT 1';
        packageCheck = await client.query(sql, params);
      }
      
      if (packageCheck.rows.length > 0) {
        // Customer has package hours available - use them
        const packageToUse = packageCheck.rows[0];
        const rh = packageToUse.remaining_hours;
        const uh = packageToUse.used_hours;
        const th = packageToUse.total_hours;
        const currentUsed = parseFloat(uh) || 0;
        const totalHours = parseFloat(th) || 0;
        const currentRemaining = rh !== null && rh !== undefined
          ? parseFloat(rh) || 0
          : Math.max(0, totalHours - currentUsed);
        const newRemainingHours = currentRemaining - parseFloat(bookingDuration);
        const newUsedHours = currentUsed + parseFloat(bookingDuration);
        
        // Update the package with validation
        // Check all 3 components for all_inclusive packages before marking used_up
        const packageUpdateResult = await client.query(`
          UPDATE customer_packages 
          SET used_hours = $1::numeric, 
              remaining_hours = $2::numeric,
              last_used_date = $5,
              updated_at = CURRENT_TIMESTAMP,
              status = CASE 
                WHEN $2::numeric <= 0
                  AND COALESCE(rental_days_remaining, 0) <= 0
                  AND COALESCE(accommodation_nights_remaining, 0) <= 0
                THEN 'used_up'
                WHEN status = 'waiting_payment' THEN 'waiting_payment'
                ELSE 'active'
              END
          WHERE id = $3 AND status IN ('active', 'waiting_payment') 
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $4::numeric)
            AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)
          RETURNING id, package_name, used_hours, remaining_hours, status
        `, [parseFloat(newUsedHours), parseFloat(newRemainingHours), packageToUse.id, parseFloat(bookingDuration), date]);
        
        // Validate the package was actually updated
        if (packageUpdateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: 'Package update failed',
            message: 'The selected package could not be updated. It may have been modified by another user or no longer has sufficient hours.'
          });
        }
        
        const updatedPackage = packageUpdateResult.rows[0];
        
        finalPaymentStatus = 'package';
        // Store prorated package cost so the booking displays the correct "lesson value"
        const pkgPurchasePrice = parseFloat(packageToUse.purchase_price) || 0;
        const pkgTotalHours = parseFloat(packageToUse.total_hours) || 1;
        finalAmount = pkgPurchasePrice > 0
          ? parseFloat(((pkgPurchasePrice / pkgTotalHours) * bookingDuration).toFixed(2))
          : 0;
        usedPackageId = packageToUse.id;

        // If the package is waiting_payment (bank transfer pending admin approval),
        // mark the booking as pending_payment so it doesn't appear on the calendar
        if (packageToUse.pkg_status === 'waiting_payment') {
          finalStatus = 'pending_payment';
          finalPaymentStatus = 'pending_payment';
        }
      } else {
        return res.status(400).json({ 
          error: 'Insufficient or mismatched package',
          message: bookingServiceName
            ? `No active ${bookingServiceName} package with enough hours. Choose a matching package or pay individually.`
            : 'No active package with enough hours. Choose a package or pay individually.'
        });
      }
    }

    // ── Partner package deduction (group bookings with partner) ─────────
    let partnerPackageUsed = null;
    if (partner_user_id && partner_customer_package_id && use_package === true && usedPackageId) {
      const partnerPkgCheck = await client.query(
        `SELECT id, package_name, remaining_hours, total_hours, used_hours
         FROM customer_packages
         WHERE id = $1 AND customer_id = $2 AND status = 'active'
           AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $3)
           AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) > 0)`,
        [partner_customer_package_id, partner_user_id, parseFloat(bookingDuration)]
      );

      if (partnerPkgCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Partner package insufficient',
          message: 'Your partner does not have enough remaining hours in their package for this session.'
        });
      }

      const pPkg = partnerPkgCheck.rows[0];
      const pCurrentUsed = parseFloat(pPkg.used_hours) || 0;
      const pTotalHours = parseFloat(pPkg.total_hours) || 0;
      const pCurrentRemaining = pPkg.remaining_hours != null
        ? parseFloat(pPkg.remaining_hours) || 0
        : Math.max(0, pTotalHours - pCurrentUsed);
      const pNewRemaining = pCurrentRemaining - parseFloat(bookingDuration);
      const pNewUsed = pCurrentUsed + parseFloat(bookingDuration);

      const partnerUpdateResult = await client.query(`
        UPDATE customer_packages
        SET used_hours = $1::numeric,
            remaining_hours = $2::numeric,
            last_used_date = $5,
            updated_at = CURRENT_TIMESTAMP,
            status = CASE
              WHEN $2::numeric <= 0
                AND COALESCE(rental_days_remaining, 0) <= 0
                AND COALESCE(accommodation_nights_remaining, 0) <= 0
              THEN 'used_up'
              ELSE 'active'
            END
        WHERE id = $3 AND status = 'active'
          AND (COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) >= $4::numeric)
        RETURNING id, package_name, used_hours, remaining_hours, status
      `, [parseFloat(pNewUsed), parseFloat(pNewRemaining), partner_customer_package_id, parseFloat(bookingDuration), date]);

      if (partnerUpdateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({
          error: 'Partner package update failed',
          message: 'Could not deduct hours from partner\'s package. It may have been modified concurrently.'
        });
      }
      partnerPackageUsed = partnerUpdateResult.rows[0];
    }
    
    // Voucher/promo code handling for individual bookings (not package-based)
    let voucherDiscount = 0;
    let appliedVoucher = null;
    let originalAmount = finalAmount;
    
    if (voucherId && use_package === false && finalAmount > 0) {
      try {
        let userRoleForVoucher = req.user?.role || 'student';
        if (student_user_id && student_user_id !== req.user?.id) {
          const ur = await client.query('SELECT role FROM users WHERE id = $1', [student_user_id]);
          userRoleForVoucher = ur.rows[0]?.role || 'student';
        }

        const voucherCode = await voucherService.resolveVoucherLookupCode(voucherId);
        if (!voucherCode) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'This voucher code does not exist',
            code: 'VOUCHER_INVALID',
          });
        }

        const voucherValidation = await voucherService.validateVoucher({
          code: voucherCode,
          userId: student_user_id,
          userRole: userRoleForVoucher,
          context: 'lessons',
          amount: finalAmount,
          currency: walletCurrency,
          serviceId: service_id != null ? String(service_id) : undefined,
        });

        if (!voucherValidation.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: voucherValidation.message || voucherValidation.error || 'Invalid voucher code',
            code: 'VOUCHER_INVALID',
          });
        }

        const fullVoucher = await voucherService.getVoucherById(voucherValidation.voucher.id);
        if (!fullVoucher) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Voucher not found',
            code: 'VOUCHER_INVALID',
          });
        }
        appliedVoucher = fullVoucher;

        // Handle wallet_credit type vouchers - don't apply as discount
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          logger.info('Wallet credit voucher will be applied after booking', {
            voucherId: appliedVoucher.id,
            creditAmount: appliedVoucher.discount_value,
            userId: student_user_id
          });
        } else {
          // Calculate discount for percentage/fixed amount
          const discountResult = voucherService.calculateDiscount(appliedVoucher, finalAmount, walletCurrency);
          voucherDiscount = discountResult.discountAmount;
          finalAmount = discountResult.finalAmount;

          logger.info('Voucher discount applied to booking', {
            voucherId: appliedVoucher.id,
            voucherCode: appliedVoucher.code,
            originalAmount,
            discountAmount: voucherDiscount,
            finalAmount,
            voucherType: appliedVoucher.voucher_type,
            userId: student_user_id
          });
        }
      } catch (voucherErr) {
        logger.error('Error validating voucher for booking', {
          voucherId,
          userId: student_user_id,
          error: voucherErr.message
        });
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Failed to validate voucher',
          code: 'VOUCHER_ERROR'
        });
      }
    }
    
    // D1: the wallet must be charged NET of any manual discount. The booking row
    // already stores the net price (calculatedFinalAmount = finalAmount −
    // discount_amount), but the charge below previously used the GROSS finalAmount,
    // overcharging the customer by the discount. netChargeable is the amount the
    // customer actually owes; final_amount (net) stays the single discounted figure
    // the salary paths read, so there is no double-subtraction.
    const manualDiscount = Math.max(0, parseFloat(req.body.discount_amount) || 0);
    const netChargeable = Math.max(0, finalAmount - manualDiscount);

    // Defer transactions until booking exists, so we can attach booking_id
    const isHybridPayment = requestedPaymentMethod === 'wallet_hybrid' && use_package === false && netChargeable > 0;
    const isCreditCardPayment = (requestedPaymentMethod === 'credit_card' && use_package === false && netChargeable > 0) || isHybridPayment;
    let hybridWalletDeducted = 0;
    const pendingTransactions = [];
    if (student_user_id && use_package === false) {
      if (isHybridPayment) {
        // Hybrid: deduct what we can from wallet, charge the rest via Iyzico.
        // Read availability against the SAME currency the debit will hit
        // (walletTransactionCurrency = EUR, the storage currency) — not the
        // user's preferred_currency. Otherwise a non-EUR-preferred user's EUR
        // wallet was ignored (availability read returned 0 → whole amount wrongly
        // routed to the card).
        try {
          const balResult = await client.query(
            `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
            [student_user_id, walletTransactionCurrency]
          );
          const walletAvailable = parseFloat(balResult.rows[0]?.available_amount) || 0;
          hybridWalletDeducted = Math.min(walletAvailable, netChargeable);

          if (hybridWalletDeducted > 0) {
            pendingTransactions.push({
              userId: student_user_id,
              amount: -Math.abs(hybridWalletDeducted),
              type: 'booking_charge',
              description: `Partial wallet payment for lesson: ${date} ${start_hour}:00 (${bookingDuration}h)`,
              status: 'completed',
              currency: walletTransactionCurrency,
              metadata: {
                paymentMethod: 'wallet_hybrid',
                bookingDate: date,
                walletPortion: hybridWalletDeducted,
                cardPortion: netChargeable - hybridWalletDeducted,
                source: 'student_booking_wizard'
              }
            });
          }
        } catch (walletCheckErr) {
          logger.warn('Failed to check wallet for hybrid payment, falling back to full card', {
            error: walletCheckErr.message
          });
        }
        finalPaymentStatus = 'pending_payment';
      } else if (requestedPaymentMethod === 'credit_card') {
        // Credit card: don't charge wallet — Iyzico handles the payment
        finalPaymentStatus = 'pending_payment';
      } else if (requestedPaymentMethod === 'bank_transfer') {
        // Bank transfer: don't charge wallet — manual admin approval handles the payment
        // Set to 'waiting_payment' to ensure the lesson doesn't appear on the confirmed calendar
        finalPaymentStatus = 'waiting_payment';
        finalNotes = (finalNotes ? finalNotes + ' | ' : '') + `Bank Transfer requested | Bank Account ID: ${req.body.bank_account_id || 'Not specified'}`;
      } else if (netChargeable > 0) {
        pendingTransactions.push({
          userId: student_user_id,
          amount: -Math.abs(netChargeable),
          type: 'booking_charge',
          description: `Individual lesson charge: ${date} ${start_hour}:00 (${bookingDuration}h)${voucherDiscount > 0 ? ` (voucher discount: ${voucherDiscount})` : ''}`,
          status: 'completed',
          currency: walletTransactionCurrency,
          metadata: {
            paymentMethod: requestedPaymentMethod || 'wallet',
            bookingDate: date,
            startHour: start_hour,
            durationHours: bookingDuration,
            source: 'student_booking_wizard',
            voucherId: appliedVoucher?.id || null,
            voucherCode: appliedVoucher?.code || null,
            originalAmount: originalAmount,
            voucherDiscount: voucherDiscount
          }
        });
        finalPaymentStatus = 'paid';
      } else {
        finalPaymentStatus = 'paid'; // Pay-and-go: even zero amount is considered paid
      }
    } else if (use_package !== true) {
      // Only default to 'paid' when NOT using a package
      // When use_package === true, finalPaymentStatus was already set to 'package' above
      finalPaymentStatus = 'paid'; // Pay-and-go: default to paid
    }
    
    // Insert booking with calculated payment status
    const bookingColumns = [
      'date',
      'start_hour',
      'duration',
      'student_user_id',
      'instructor_user_id',
      'customer_user_id',
      'status',
      'payment_status',
      'amount',
      'discount_percent',
      'discount_amount',
      'final_amount',
      'notes',
      'location',
      'weather_conditions',
      'service_id',
      'checkin_notes',
      'checkout_notes',
      'customer_package_id',
      'group_size',
      'package_hours_used',
      'cash_hours_used'
    ];

    // Calculate final amount
    const discountAmount = req.body.discount_amount || 0;
    const calculatedFinalAmount = finalAmount - discountAmount;
    // POST / has no partial path: a package booking draws the full duration from
    // the package (cash 0); everything else is cash-only (no package hours).
    const isFullPackageBooking = finalPaymentStatus === 'package' && !!usedPackageId;
    // Spillover bookings record the exact pooled-hours / cash split; legacy
    // (partner / no-spillover) bookings keep the full-duration convention.
    const pkgHoursUsedVal = spilloverResult
      ? spilloverResult.packageHoursTotal
      : (isFullPackageBooking ? parseFloat(duration) : null);
    const cashHoursUsedVal = spilloverResult
      ? spilloverResult.cashHours
      : (isFullPackageBooking ? 0 : null);

    const bookingValues = [
      date,
      parseFloat(start_hour), // Ensure numeric type for PostgreSQL
      parseFloat(duration), // Allow decimal durations (was parseInt)
      student_user_id,
      instructor_user_id,
      student_user_id, // customer_user_id = student_user_id for most cases
      finalStatus,
      finalPaymentStatus, // Now properly calculated based on package availability
      parseFloat(finalAmount) || 0, // Ensure numeric type
      parseFloat(req.body.discount_percent) || 0, // Ensure numeric type
      parseFloat(discountAmount) || 0, // Ensure numeric type
      parseFloat(calculatedFinalAmount) || 0, // Ensure numeric type
      finalNotes,
      location || 'TBD',
      req.body.weather_conditions || 'Good',
      req.body.service_id,
      req.body.checkin_notes || '',
      req.body.checkout_notes || '',
      usedPackageId, // Include the package ID that was used
      (partner_user_id && partnerPackageUsed) ? 2 : 1, // group_size: 2 if partner included
      pkgHoursUsedVal, // package_hours_used (spillover: total pooled hours)
      cashHoursUsedVal // cash_hours_used (spillover: overflow leg)
    ];

    const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
    const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const insertBookingQuery = `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING *`;

    const bookingResult = await client.query(insertBookingQuery, bookingInsertValues);

    const booking = bookingResult.rows[0];

    // Persist the cross-package draws now that the booking id exists. The ledger
    // is the source of truth for valuation (Σ hours×rate) and reversal.
    if (spilloverResult && spilloverResult.draws.length > 0) {
      await recordConsumptionLedger(client, {
        bookingId: booking.id,
        participantId: null,
        draws: spilloverResult.draws,
      });
    }

    await applySelfStudentCommissionIfMatch(client, booking);

    // For bank transfers, insert the receipt tracking row immediately
    if (requestedPaymentMethod === 'bank_transfer' && req.body.receiptUrl) {
      const bookingDepositPercent = req.body.deposit_percent || 0;
      const isBookingDeposit = bookingDepositPercent > 0;
      const bookingReceiptAmount = isBookingDeposit
        ? parseFloat(((finalAmount || 0) * bookingDepositPercent / 100).toFixed(2))
        : (finalAmount || 0);

      await client.query(`
        INSERT INTO bank_transfer_receipts (
          user_id, booking_id, bank_account_id, receipt_url, amount, currency, status, admin_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        student_user_id,
        booking.id,
        req.body.bank_account_id || null,
        req.body.receiptUrl,
        bookingReceiptAmount,
        req.body.currency || 'EUR',
        'pending',
        isBookingDeposit ? `DEPOSIT ${bookingDepositPercent}% — Paid: ${bookingReceiptAmount} ${req.body.currency || 'EUR'}, Remaining: ${parseFloat(((finalAmount || 0) - bookingReceiptAmount).toFixed(2))} ${req.body.currency || 'EUR'} due on arrival` : null
      ]);
      
      logger.info('Bank transfer receipt recorded for individual booking', {
        userId: student_user_id, bookingId: booking.id, receiptUrl: req.body.receiptUrl,
        ...(isBookingDeposit ? { depositPercent: bookingDepositPercent, receiptAmount: bookingReceiptAmount } : {})
      });

      try {
        req.socketService?.emitToChannel('dashboard', 'pending-transfer:new', { type: 'booking', bookingId: booking.id });
      } catch (e) { /* ignore */ }
    }

    // Now create any pending transactions with booking_id
    for (const tx of (pendingTransactions || [])) {
      const walletMetadata = {
        ...(tx.metadata || {}),
        bookingId: booking.id,
        actorId
      };

      try {
        await recordWalletTransaction({
          userId: tx.userId,
          amount: tx.amount,
          transactionType: tx.type,
          currency: tx.currency,
          status: tx.status,
          description: tx.description,
          metadata: walletMetadata,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance, // Staff can book even if customer has no balance
          client
        });
      } catch (walletError) {
        logger.error('Failed to record wallet ledger entry for booking charge', {
          bookingId: booking.id,
          userId: tx.userId,
          amount: tx.amount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    // If partial payment scenario, optionally auto-charge the cash portion under flag
    if (BILLING_PARTIAL_PRECISION && booking.payment_status === 'partial') {
      const cashPortion = parseFloat(booking.final_amount) || 0;
      if (cashPortion > 0 && booking.student_user_id) {
        await recordWalletTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(cashPortion),
          transactionType: 'booking_charge',
          currency: booking.currency || DEFAULT_CURRENCY,
          status: 'completed',
          description: 'Individual lesson cash portion',
          metadata: { bookingId: booking.id, actorId, source: 'partial_cash_portion' },
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance, // Staff can book even if customer has no balance
          client
        });
      }
    }
    
    // Validate package booking integrity
    if (usedPackageId && booking.payment_status === 'package') {
      if (!booking.customer_package_id) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          error: 'Package booking integrity error',
          message: 'Package hours were deducted but booking was not properly linked to the package. Please try again.'
        });
      }
      
      const packageVerification = await client.query(`
        SELECT id, package_name, used_hours, remaining_hours, status
        FROM customer_packages 
        WHERE id = $1
      `, [usedPackageId]);
      
      if (packageVerification.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          error: 'Package verification failed',
          message: 'Package could not be verified after booking creation. Please try again.'
        });
      }
    }

    // ── Create booking_participants for group partner booking ──────────────
    if (partner_user_id && partnerPackageUsed && usedPackageId) {
      // Primary participant
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, customer_package_id, package_hours_used, notes)
         VALUES ($1, $2, true, 'package', 0, $3, $4, '')`,
        [booking.id, student_user_id, usedPackageId, parseFloat(bookingDuration)]
      );
      // Partner participant
      await client.query(
        `INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, customer_package_id, package_hours_used, notes)
         VALUES ($1, $2, false, 'package', 0, $3, $4, '')`,
        [booking.id, partner_user_id, partner_customer_package_id, parseFloat(bookingDuration)]
      );
    }
    
    // Add equipment associations if any
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipment_id of equipment_ids) {
        await client.query(
          'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
          [booking.id, equipment_id]
        );
      }
    }
      await client.query('COMMIT');

    // Seed the instructor_earnings snapshot at creation (S1), matching POST
    // /group and POST /calendar. Without this, a single booking had NO earnings
    // row until a later edit/completion, so payroll/commission views showed €0.
    try {
      await BookingUpdateCascadeService.cascadeBookingUpdate(
        booking,
        { _custom_commission_changed: true }
      );
    } catch (cascadeError) {
      logger.warn('Failed to cascade instructor earnings after single booking creation', {
        bookingId: booking.id, error: cascadeError?.message
      });
    }

    // Redeem voucher if one was applied
    let voucherRedemptionInfo = null;
    if (appliedVoucher) {
      try {
        const redemptionResult = await voucherService.redeemVoucher({
          voucherId: appliedVoucher.id,
          userId: student_user_id,
          referenceType: 'booking',
          referenceId: String(booking.id),
          originalAmount,
          discountAmount: voucherDiscount,
          currency: walletCurrency,
        });
        
        voucherRedemptionInfo = {
          voucherId: appliedVoucher.id,
          code: appliedVoucher.code,
          type: appliedVoucher.voucher_type,
          discountApplied: voucherDiscount,
          originalAmount,
          finalAmount
        };
        
        // If it's a wallet_credit voucher, apply the credit now
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          try {
            const creditResult = await voucherService.applyWalletCredit(
              student_user_id,
              appliedVoucher.discount_value,
              appliedVoucher.id,
              walletCurrency
            );
            voucherRedemptionInfo.walletCreditApplied = Math.abs(
              parseFloat(creditResult?.amount ?? appliedVoucher.discount_value) || 0
            );
            voucherRedemptionInfo.walletCurrency = creditResult?.currency || walletCurrency;
            
            logger.info('Wallet credit voucher applied after booking', {
              voucherId: appliedVoucher.id,
              userId: student_user_id,
              creditAmount: voucherRedemptionInfo.walletCreditApplied,
              currency: voucherRedemptionInfo.walletCurrency,
            });
          } catch (creditErr) {
            logger.error('Failed to apply wallet credit from voucher after booking', {
              voucherId: appliedVoucher.id,
              userId: student_user_id,
              error: creditErr.message
            });
          }
        }
        
        logger.info('Voucher redeemed for booking', {
          voucherId: appliedVoucher.id,
          bookingId: booking.id,
          userId: student_user_id,
          discountApplied: voucherDiscount
        });
      } catch (redeemErr) {
        logger.error('Failed to redeem voucher (booking still succeeded)', {
          voucherId: appliedVoucher.id,
          userId: student_user_id,
          error: redeemErr.message
        });
      }
    }

    // Check if user should be upgraded from outsider to student after their first booking
    let roleUpgradeInfo = null;
    if (student_user_id) {
      try {
        const upgradeResult = await checkAndUpgradeAfterBooking(student_user_id);
        if (upgradeResult.upgraded) {
          logger.info('User automatically upgraded to student after first booking', {
            userId: student_user_id,
            bookingId: booking.id,
            newRole: upgradeResult.newRole
          });
          roleUpgradeInfo = {
            upgraded: true,
            newRole: upgradeResult.newRole,
            message: 'Congratulations! You have been upgraded to a student account.'
          };
        }
      } catch (upgradeError) {
        // Log but don't fail the booking if upgrade fails
        logger.warn('Failed to check/upgrade user role after booking', {
          userId: student_user_id,
          bookingId: booking.id,
          error: upgradeError?.message
        });
      }
    }

    // Send notifications only if booking was created by student/outsider (not by staff)
    const createdByRole = req.user?.role;
    const staffRoles = ['admin', 'manager', 'instructor', 'owner'];
    const isStaffCreated = staffRoles.includes(createdByRole);

    if (!isStaffCreated) {
      try {
        await bookingNotificationService.sendBookingCreated({ bookingId: booking.id });
      } catch (notificationError) {
        logger.warn('Failed to dispatch booking notifications for single booking', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
    } else if (createdByRole === 'instructor') {
      // Instructor creating a booking — handled below with admin/manager approval flow.
      // Instructor bookings go as pending — notify admins/managers for approval
      const instructorName = req.user?.name || req.user?.first_name || 'An instructor';
      const sessionDate = date;
      const sessionTime = start_hour != null
        ? `${Math.floor(parseFloat(start_hour))}:${String(Math.round((parseFloat(start_hour) % 1) * 60)).padStart(2, '0')}`
        : '';
      try {
        await dispatchToStaff({
          type: 'new_booking_alert',
          title: 'Instructor Booking — Approval Needed',
          message: `${instructorName} created a ${bookingDuration}h ${bookingServiceName || 'lesson'} booking on ${sessionDate}${sessionTime ? ` at ${sessionTime}` : ''} — pending your approval.`,
          data: {
            bookingId: booking.id,
            instructorId: instructor_user_id || req.user?.id,
            instructorName,
            date: sessionDate,
            status: 'pending',
            cta: { label: 'Review Booking', href: `/calendars/lessons?bookingId=${booking.id}&date=${sessionDate}` }
          },
          excludeUserIds: [req.user?.id],
          roles: ['admin', 'manager', 'owner']
        });
      } catch (notificationError) {
        logger.warn('Failed to dispatch instructor pending booking notification', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
      // Real-time push to admin/manager roles
      if (req.socketService) {
        try {
          const pendingPayload = {
            bookingId: booking.id,
            instructorName,
            serviceName: bookingServiceName || 'Lesson',
            date: sessionDate,
            startTime: sessionTime,
            duration: bookingDuration,
            status: 'pending'
          };
          req.socketService.emitToChannel('role:admin', 'booking:pending_approval', pendingPayload);
          req.socketService.emitToChannel('role:manager', 'booking:pending_approval', pendingPayload);
          req.socketService.emitToChannel('role:owner', 'booking:pending_approval', pendingPayload);
        } catch (socketError) {
          logger.warn('Failed to emit instructor pending booking socket event', { error: socketError?.message });
        }
      }
    } else {
      logger.info('Skipping student/staff fan-out - created by staff', {
        bookingId: booking.id,
        createdBy: actorId,
        role: createdByRole
      });
    }

    // Notify the assigned instructor for staff-created bookings. The
    // student-created path already notifies them via sendBookingCreated
    // (booking_instructor), so skip there to avoid duplicates. We DON'T
    // skip self-assignment — many users wear both manager and instructor
    // hats and want the Telegram ping for their own bookings.
    if (isStaffCreated && booking.instructor_user_id) {
      try {
        await bookingNotificationService.notifyInstructorAssigned({
          bookingId: booking.id,
          instructorUserId: booking.instructor_user_id
        });
      } catch (err) {
        logger.warn('Failed to notify instructor of new assignment', {
          bookingId: booking.id,
          error: err?.message
        });
      }
    }

    // Notify partner about the group session booking
    if (partner_user_id && partnerPackageUsed) {
      try {
        const bookerName = req.user?.name || req.user?.first_name || 'Your partner';
        const sessionDate = date;
        const sessionTime = `${Math.floor(parseFloat(start_hour))}:${String(Math.round((parseFloat(start_hour) % 1) * 60)).padStart(2, '0')}`;
        await dispatchNotification({
          userId: partner_user_id,
          type: 'booking',
          title: 'Group Session Invite',
          message: `${bookerName} wants to book a ${bookingDuration}h ${bookingServiceName || 'group'} lesson with you on ${sessionDate} at ${sessionTime}. Do you accept?`,
          data: {
            bookingId: booking.id,
            bookerUserId: student_user_id,
            bookerName,
            date: sessionDate,
            startHour: parseFloat(start_hour),
            duration: bookingDuration,
            serviceName: bookingServiceName,
            packageRemainingHours: parseFloat(partnerPackageUsed.remaining_hours),
            action: 'partner_invite',
            cta: {
              label: 'View Invite',
              href: '/student/schedule?tab=group'
            }
          }
        });
        // Real-time push — partner invite popup
        if (req.socketService) {
          req.socketService.emitToChannel(`user:${partner_user_id}`, 'booking:partner_invite', {
            bookingId: booking.id,
            bookerName,
            serviceName: bookingServiceName || 'Group Lesson',
            date: sessionDate,
            startTime: sessionTime,
            duration: bookingDuration,
            packageRemainingHours: parseFloat(partnerPackageUsed.remaining_hours),
          });
        }
      } catch (notifErr) {
        logger.warn('Failed to notify partner about group session', {
          partnerId: partner_user_id,
          bookingId: booking.id,
          error: notifErr?.message
        });
      }
    }
    
    // Emit real-time event for booking creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', booking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
        if (booking.status === 'pending_payment' || booking.payment_status === 'pending_payment') {
          req.socketService.emitToChannel('dashboard', 'pending-transfer:updated', { bookingId: booking.id });
        }
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
      }
    }
    
    // Include role upgrade info and voucher info in response
    const response = { ...booking };
    if (roleUpgradeInfo) {
      response.roleUpgrade = roleUpgradeInfo;
    }
    if (voucherRedemptionInfo) {
      response.voucher = voucherRedemptionInfo;
    }

    // For credit card payments, initiate Iyzico checkout and return payment URL
    if (isCreditCardPayment) {
      try {
        // For hybrid payments, only charge the card for the deficit (total - wallet portion)
        const cardChargeAmount = isHybridPayment
          ? Math.max(0, finalAmount - hybridWalletDeducted)
          : finalAmount;

        if (cardChargeAmount > 0) {
          const iyzicoItems = [{
            id: String(booking.service_id || booking.id),
            name: bookingServiceName || `Booking #${booking.id}`,
            price: parseFloat(cardChargeAmount).toFixed(2)
          }];

          const gatewayResult = await initiateDeposit({
            amount: cardChargeAmount,
            currency: walletCurrency || 'EUR',
            userId: student_user_id,
            referenceCode: `BKG-${booking.id}`,
            items: iyzicoItems
          });

          response.paymentPageUrl = gatewayResult.paymentPageUrl;
          if (isHybridPayment) {
            response.hybridPayment = {
              walletCharged: hybridWalletDeducted,
              cardCharge: cardChargeAmount,
              totalAmount: finalAmount
            };
          }
          logger.info('Iyzico checkout initiated for booking', {
            bookingId: booking.id,
            amount: cardChargeAmount,
            hybridWalletDeducted,
            currency: walletCurrency,
            userId: student_user_id
          });
        } else {
          // Hybrid payment fully covered by wallet (edge case)
          finalPaymentStatus = 'paid';
          await pool.query(
            `UPDATE bookings SET payment_status = 'paid' WHERE id = $1`,
            [booking.id]
          );
        }
      } catch (iyzicoErr) {
        logger.error('Failed to initiate Iyzico checkout for booking', {
          bookingId: booking.id,
          error: iyzicoErr.message
        });
        // Booking was created but payment initiation failed — mark it
        await pool.query(
          `UPDATE bookings SET payment_status = 'failed' WHERE id = $1`,
          [booking.id]
        );
        // Reverse the already-committed hybrid wallet debit so the customer is not
        // charged for a booking whose card payment never started (orphan debit).
        // Idempotent so a client retry of the same booking can't over-refund.
        if (isHybridPayment && hybridWalletDeducted > 0) {
          try {
            await recordWalletTransaction({
              userId: student_user_id,
              amount: Math.abs(hybridWalletDeducted),
              direction: 'credit',
              currency: walletCurrency || 'EUR',
              transactionType: 'booking_cancelled_refund',
              description: `Hybrid payment init failed — wallet portion refunded (booking ${booking.id})`,
              relatedEntityType: 'booking',
              relatedEntityId: booking.id,
              bookingId: booking.id,
              createdBy: student_user_id,
              idempotencyKey: `booking-hybrid-reversal:${booking.id}`,
              allowNegative: true,
            });
          } catch (reversalErr) {
            logger.error('Failed to reverse hybrid wallet debit after Iyzico init failure', {
              bookingId: booking.id, error: reversalErr.message
            });
          }
        }
        return res.status(500).json({
          error: 'payment_initiation_failed',
          message: 'Booking was created but payment could not be initiated. Please try again or use a different payment method.',
          bookingId: booking.id
        });
      }
    }
    
    res.status(201).json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    
    // Handle PostgreSQL constraint violations
    if (err.code === '23505') {
      if (err.constraint === 'idx_bookings_no_overlap') {
        logger.warn('Double-booking attempted', {
          instructor: req.body?.instructor_user_id,
          date: req.body?.date,
          startHour: req.body?.start_hour,
          duration: req.body?.duration
        });
        return res.status(409).json({
          error: 'booking_conflict',
          message: 'This time slot is already booked for this instructor. Please choose a different time.'
        });
      }
      // Handle other unique constraint violations
      logger.warn('Unique constraint violation during booking creation', { constraint: err.constraint });
      return res.status(409).json({
        error: 'conflict',
        message: 'A booking with these details already exists.'
      });
    }
    
    const errorMessage = err?.message || '';
    if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('wallet')) {
      logger.warn('Booking creation failed due to wallet balance issue', {
        studentId: req.body?.student_user_id,
        error: errorMessage
      });
      return res.status(400).json({
        error: 'insufficient_wallet_balance',
        message: 'Your wallet balance is not sufficient to cover this booking.'
      });
    }

    logger.error('Error creating booking:', err);
    return res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client.release();
  }
});

// CREATE a new GROUP booking with multiple participants
// POST /bookings/group - Create group booking with multiple participants
router.post('/group', 
  authenticateJWT, 
  authorizeRoles(['admin', 'manager', 'instructor', 'front_desk', 'student'], 'bookings:write'),
  async (req, res) => {
  const client = await pool.connect();
  
  try {
  logger.info('Group booking request received', { body: req.body });
    
  await client.query('BEGIN');
  const actorId = resolveActorId(req);
    
    const { 
      date, start_hour, duration, instructor_user_id, 
      status, notes, location, equipment_ids, service_id,
      participants, // Array of participant objects with payment info
    } = req.body;

    // Negative-balance override derived purely from req.user.role — never from the request body.
    // receptionist was previously missing from this list (group bookings only); now consistent
    // with single + calendar booking entry points.
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'receptionist', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    const isTrustedCustomer = req.user?.role === 'trusted_customer';
    const allowNegativeBalance = isStaffBooker || isTrustedCustomer;

    // Staff roles automatically confirm bookings (admin, manager, front_desk)
    const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk'];
    const shouldAutoConfirm = staffRolesForAutoConfirm.includes(req.user?.role);
    const finalStatus = shouldAutoConfirm ? 'confirmed' : (status || 'pending');

    // Normalize participants to accept older client field names and sanitize boolean fields
    const normalizedParticipants = Array.isArray(participants) ? participants.map(p => ({
      ...p,
      customerPackageId: p.customerPackageId || p.selectedPackageId || p.selected_package_id,
      // Ensure boolean fields are properly converted (empty strings, undefined, etc. become false)
      isPrimary: p.isPrimary === true || p.isPrimary === 'true',
      usePackage: p.usePackage === true || p.usePackage === 'true',
      manualCashPreference: p.manualCashPreference === true || p.manualCashPreference === 'true'
    })) : [];
    
    logger.info('Group booking parsed values', {
      date, start_hour, duration, instructor_user_id, status, location, service_id,
  participantCount: normalizedParticipants?.length
    });
    
    // Validate required fields
  if (!date || !normalizedParticipants || !Array.isArray(normalizedParticipants) || normalizedParticipants.length === 0) {
      return res.status(400).json({ error: 'Date and participants are required for group booking' });
    }
    
    // Validate start_hour constraint (align with single booking: allow 0-24 range)
    if (start_hour !== undefined && start_hour !== null) {
      const startHourNum = Number(start_hour);
      if (!Number.isFinite(startHourNum) || startHourNum < 0 || startHourNum > 24) {
        return res.status(400).json({ error: `Invalid start_hour: ${start_hour}. Must be between 00:00 and 24:00` });
      }
    }
    
    // Validate instructor_user_id
    if (!instructor_user_id) {
      return res.status(400).json({ error: 'instructor_user_id is required' });
    }
    
    // Validate participants have required fields
    for (let i = 0; i < normalizedParticipants.length; i++) {
      const participant = normalizedParticipants[i];
      if (!participant.userId) {
        return res.status(400).json({ error: `Participant ${i + 1} is missing userId` });
      }
      logger.info(`Group booking participant ${i + 1}`, {
        userId: participant.userId,
        userName: participant.userName,
        usePackage: participant.usePackage,
        paymentStatus: participant.paymentStatus,
        isPrimary: participant.isPrimary
      });
    }
    
    const bookingDuration = parseFloat(duration) || 1;

    const normalizedDate = typeof date === 'string' && date.includes('T')
      ? date.split('T')[0]
      : date;
    const startHourNumeric = Number(start_hour);

    if (!Number.isFinite(startHourNumeric)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'start_hour is required for group booking' });
    }

    const slotCheck = await client.query(
      `SELECT id, start_hour, duration, (start_hour + duration) as end_hour
       FROM bookings 
       WHERE date = $1 
         AND instructor_user_id = $2
         AND status NOT IN ('cancelled', 'pending_payment')
         AND deleted_at IS NULL
         AND (
           (start_hour <= $3 AND (start_hour + duration) > $3) OR
           (start_hour >= $3 AND start_hour < ($3 + $4))
         )`,
      [normalizedDate, instructor_user_id, startHourNumeric, bookingDuration]
    );

    if (slotCheck.rows.length > 0) {
      const conflictingBooking = slotCheck.rows[0];
      const formatTime = (hourValue) => {
        const hours = Math.floor(hourValue);
        const minutes = Math.round((hourValue - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      };

      const requestedStartTime = formatTime(startHourNumeric);
      const requestedEndTime = formatTime(startHourNumeric + bookingDuration);
      const conflictStartTime = formatTime(conflictingBooking.start_hour);
      const conflictEndTime = formatTime(conflictingBooking.start_hour + conflictingBooking.duration);

      const allBookingsQuery = await client.query(
        `SELECT start_hour, duration 
         FROM bookings 
         WHERE date = $1 
           AND instructor_user_id = $2
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
         ORDER BY start_hour`,
        [normalizedDate, instructor_user_id]
      );

      const suggestedSlots = [];
      const workingHours = { start: 8, end: 18 };
      const existingBookings = allBookingsQuery.rows.sort((a, b) => a.start_hour - b.start_hour);

      const hasConflict = (start) => {
        const slotEnd = start + bookingDuration;
        return existingBookings.some((booking) => {
          const bookingStart = parseFloat(booking.start_hour);
          const bookingEnd = bookingStart + parseFloat(booking.duration);
          return start < bookingEnd && slotEnd > bookingStart;
        });
      };

      const addSuggestion = (start) => {
        const slotEnd = start + bookingDuration;
        const hours = Math.floor(start);
        const minutes = Math.round((start - hours) * 60);
        const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const endHours = Math.floor(slotEnd);
        const endMinutes = Math.round((slotEnd - endHours) * 60);
        const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
        suggestedSlots.push({
          startTime: slotStartTime,
          endTime: slotEndTime,
          startHour: start,
          duration: bookingDuration
        });
      };

      const conflictingEnd = parseFloat(conflictingBooking.start_hour) + parseFloat(conflictingBooking.duration);
      let searchStart = Math.ceil((conflictingEnd + 0.5) * 2) / 2;

      for (let hour = searchStart; hour <= workingHours.end - bookingDuration; hour += 0.5) {
        if (!hasConflict(hour)) {
          addSuggestion(hour);
        }
        if (suggestedSlots.length >= 2) break;
      }

      if (suggestedSlots.length < 3) {
        const conflictingStart = parseFloat(conflictingBooking.start_hour);
        for (let hour = workingHours.start; hour <= conflictingStart - bookingDuration; hour += 0.5) {
          if (!hasConflict(hour) && hour + bookingDuration <= conflictingStart) {
            addSuggestion(hour);
          }
          if (suggestedSlots.length >= 3) break;
        }
      }

      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Time slot unavailable',
        details: {
          message: `The requested time slot ${requestedStartTime}-${requestedEndTime} conflicts with an existing booking from ${conflictStartTime}-${conflictEndTime}.`,
          conflictingSlot: {
            startTime: conflictStartTime,
            endTime: conflictEndTime
          },
          requestedSlot: {
            startTime: requestedStartTime,
            endTime: requestedEndTime
          },
          suggestedSlots,
          date: normalizedDate
        },
        conflicts: slotCheck.rows
      });
    }

  const groupSize = normalizedParticipants.length;
    
    // Find the primary participant
  const primaryParticipant = normalizedParticipants.find(p => p.isPrimary) || normalizedParticipants[0];
    
    // Get the primary participant's preferred currency for billing
    let billingCurrency = DEFAULT_CURRENCY;
    if (primaryParticipant?.userId) {
      const userCurrencyQuery = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [primaryParticipant.userId]
      );
      if (userCurrencyQuery.rows.length > 0 && userCurrencyQuery.rows[0].preferred_currency) {
        billingCurrency = userCurrencyQuery.rows[0].preferred_currency;
      }
    }
    
    // Get service info for calculations and package matching
    let servicePrice = 0;
    let serviceDurationHours = null;
    let serviceName = null;
    let svcDisciplineTag = null;
    let svcLessonCategoryTag = null;
    if (service_id) {
      const serviceQuery = await client.query('SELECT price, name, category, currency, duration, discipline_tag, lesson_category_tag FROM services WHERE id = $1', [service_id]);
      if (serviceQuery.rows.length > 0) {
        serviceName = serviceQuery.rows[0].name || null;
        svcDisciplineTag = serviceQuery.rows[0].discipline_tag || null;
        svcLessonCategoryTag = serviceQuery.rows[0].lesson_category_tag || null;
        serviceDurationHours = parseFloat(serviceQuery.rows[0].duration) || null;
        // Look up price in user's preferred currency
        const priceResult = await getServicePriceInCurrency(service_id, billingCurrency);
        if (priceResult && priceResult.price > 0) {
          servicePrice = priceResult.price;
        } else {
          // Fallback to default service price
          servicePrice = parseFloat(serviceQuery.rows[0].price) || 0;
        }
      }
    }

    // Calculate hourly rate: if the service has a defined duration (total hours), divide the
    // total price by that to get the per-hour rate, then multiply by the actual booking duration.
    // This mirrors the single-booking route logic so a 10-hour course priced at €670 correctly
    // costs €67/h × 2h = €134 for a 2-hour lesson, not €670 flat.
    const serviceHourlyRate = serviceDurationHours > 0
      ? parseFloat((servicePrice / serviceDurationHours).toFixed(4))
      : servicePrice;

  // Calculate individual participant amounts
  // For group bookings, base amount per participant = hourly rate * actual booking duration
  const participantAmount = parseFloat((serviceHourlyRate * bookingDuration).toFixed(2));
    
    // Process package logic for each participant
  const processedParticipants = [];
  const pendingTransactions = [];
  const packageFallbacks = [];
    let totalPackageUsers = 0;
    let totalPaidAmount = 0;
    let primaryParticipantPackageId = null;
    
  for (const participant of normalizedParticipants) {
      const processedParticipant = {
        ...participant,
        paymentAmount: participantAmount,
        actualPaymentStatus: 'paid', // Pay-and-go: default to paid
        customerPackageId: null
      };

      let cashRegistered = false;
      const registerCashPayment = (reason, overrideStatus) => {
        if (cashRegistered) return;

        const rawStatus = overrideStatus || participant.paymentStatus || 'paid';
        const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : rawStatus;
        const finalStatus = ['paid', 'partial', 'package'].includes(normalizedStatus) ? normalizedStatus : 'paid'; // Pay-and-go: default to paid
        const fallbackAmount = Number.isFinite(Number(participant.paymentAmount))
          ? Math.max(0, Number(participant.paymentAmount))
          : participantAmount;

        processedParticipant.actualPaymentStatus = finalStatus;
        processedParticipant.paymentAmount = fallbackAmount;
        processedParticipant.customerPackageId = null;
        processedParticipant.packageHoursUsed = 0;
        processedParticipant.cashHoursUsed = parseFloat(bookingDuration) || 0;

        totalPaidAmount += fallbackAmount;

        if (fallbackAmount > 0) {
          const transactionStatus = finalStatus === 'paid'
            ? 'completed'
            : (BILLING_PARTIAL_PRECISION && finalStatus === 'partial')
              ? 'completed'
              : 'pending';

          pendingTransactions.push({
            userId: participant.userId,
            amount: -Math.abs(fallbackAmount),
            type: 'booking_charge',
            description: `Group lesson charge: ${date} ${start_hour}:00 (${bookingDuration}h)`,
            status: transactionStatus
          });

          processedParticipant.cashTransactionStatus = transactionStatus;

          logger.info('📒 Group booking cash charge registered', {
            bookingDate: date,
            participantId: participant.userId,
            participantName: participant.userName,
            amount: fallbackAmount,
            paymentStatus: finalStatus,
            transactionStatus,
            reason: reason || null
          });
        }

        if (reason) {
          packageFallbacks.push({
            userId: participant.userId,
            userName: participant.userName,
            attemptedPackageId: participant.customerPackageId || null,
            reason
          });
        }

        cashRegistered = true;
      };
      
      // Handle package payment for this participant
      // Accept either explicit usePackage flag or a paymentStatus coming from UI as 'package'/'partial'
      const wantsToUsePackage = (
        participant.usePackage === true ||
        participant.usePackage === 'true' ||
        !!participant.customerPackageId ||
        (typeof participant.paymentStatus === 'string' &&
          ['package', 'partial'].includes(participant.paymentStatus.toLowerCase()))
      );

  if (wantsToUsePackage && participant.userId) {
    let packageApplied = false;
    let fallbackReason = null;

        // ── Cross-package FIFO spillover (per participant) ──────────────────
        const spill = await consumeAcrossPackages(client, {
          customerId: participant.userId,
          hoursNeeded: parseFloat(bookingDuration),
          matchCriteria: {
            serviceName,
            lessonCategoryTag: svcLessonCategoryTag,
            disciplineTag: svcDisciplineTag,
          },
          requestedPackageId: participant.customerPackageId || null,
          asOfDate: date,
        });

        if (spill.draws.length > 0) {
          const usedFromPackage = spill.packageHoursTotal;
          const cashHours = spill.cashHours;
          // Overflow hours billed at the service's per-hour rate.
          const cashPortion = parseFloat((cashHours * serviceHourlyRate).toFixed(2));

          processedParticipant.customerPackageId = spill.primaryPackageId;
          // Recorded to the ledger once the participant row exists (gives us its id).
          processedParticipant._spilloverDraws = spill.draws;
          if (cashPortion > 0.0001) {
            processedParticipant.actualPaymentStatus = 'partial';
            processedParticipant.paymentAmount = cashPortion;
          } else {
            processedParticipant.actualPaymentStatus = 'package';
            processedParticipant.paymentAmount = 0;
          }
          processedParticipant.packageHoursUsed = parseFloat(usedFromPackage.toFixed(2));
          processedParticipant.cashHoursUsed = parseFloat(cashHours.toFixed(2));
          if (usedFromPackage > 0) totalPackageUsers++;
          packageApplied = true;

          if (participant.isPrimary) {
            primaryParticipantPackageId = spill.primaryPackageId;
          }
        } else if (participant.customerPackageId) {
          // Specific package chosen but it (and the pool) lacks hours.
          fallbackReason = serviceName
            ? `Selected package doesn't match ${serviceName} or lacks hours.`
            : 'Selected package lacks remaining hours.';
        }

        if (!packageApplied) {
          registerCashPayment(fallbackReason || 'Package not applied; falling back to cash.');
        }
      } else {
        registerCashPayment();
      }
      
      // Accumulate cash portions for partial/package users into totalPaidAmount
      if (
        processedParticipant.customerPackageId &&
        processedParticipant.actualPaymentStatus === 'partial' &&
        processedParticipant.paymentAmount > 0
      ) {
        totalPaidAmount += processedParticipant.paymentAmount;
      }

      processedParticipants.push(processedParticipant);
    }
    
    // Determine main booking payment status and amount
    let mainBookingPaymentStatus = 'paid'; // Pay-and-go: default to paid
    let mainBookingAmount = parseFloat((serviceHourlyRate * bookingDuration * groupSize).toFixed(2));
    let mainBookingCustomerPackageId = null;
    
  if (totalPackageUsers === groupSize) {
      mainBookingPaymentStatus = 'package';
      mainBookingAmount = 0;
      mainBookingCustomerPackageId = primaryParticipantPackageId;
    } else if (totalPackageUsers > 0) {
      mainBookingPaymentStatus = 'partial';
      mainBookingAmount = totalPaidAmount;
      // Link to the primary participant's package for traceability
      mainBookingCustomerPackageId = primaryParticipantPackageId;
    } else {
      // Pay-and-go: all individual payments are considered paid
      mainBookingPaymentStatus = 'paid';
    }
    
    // Booking-level hour split = sum across participants (per-participant rows
    // remain the authoritative source for group reversal; this is a convenience
    // total for booking-level readers). NULL when no package hours were drawn.
    const groupPackageHoursTotal = processedParticipants.reduce(
      (sum, p) => sum + (parseFloat(p.packageHoursUsed) || 0), 0);
    const groupCashHoursTotal = processedParticipants.reduce(
      (sum, p) => sum + (parseFloat(p.cashHoursUsed) || 0), 0);

    // Insert main booking record
    const groupBookingColumns = [
      'date',
      'start_hour',
      'duration',
      'student_user_id',
      'instructor_user_id',
      'customer_user_id',
      'status',
      'payment_status',
      'amount',
      'final_amount',
      'notes',
      'location',
      'service_id',
      'group_size',
      'max_participants',
      'customer_package_id',
      'package_hours_used',
      'cash_hours_used'
    ];

    const groupBookingValues = [
      date,
      parseFloat(start_hour),
      parseFloat(duration),
      primaryParticipant.userId,
      instructor_user_id,
      primaryParticipant.userId,
      finalStatus,
      mainBookingPaymentStatus,
      parseFloat(mainBookingAmount) || 0,
      parseFloat(mainBookingAmount) || 0,
      notes || '',
      location || 'TBD',
      service_id,
      Number.parseInt(groupSize, 10),
      Math.max(Number.parseInt(groupSize, 10), 10),
      mainBookingCustomerPackageId,
      groupPackageHoursTotal > 0 ? groupPackageHoursTotal : null,
      groupCashHoursTotal > 0 ? groupCashHoursTotal : null
    ];

    const { columns: groupBookingInsertColumns, values: groupBookingInsertValues } = appendCreatedBy(groupBookingColumns, groupBookingValues, actorId);
    const groupBookingPlaceholders = groupBookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const groupBookingQuery = `INSERT INTO bookings (${groupBookingInsertColumns.join(', ')}) VALUES (${groupBookingPlaceholders}) RETURNING *`;

    const bookingResult = await client.query(groupBookingQuery, groupBookingInsertValues);

    const booking = bookingResult.rows[0];

    await applySelfStudentCommissionIfMatch(client, booking);

    // Insert all participants into booking_participants table with their payment details
    for (const participant of processedParticipants) {
      const participantColumns = [
        'booking_id',
        'user_id',
        'is_primary',
        'payment_status',
        'payment_amount',
        'notes',
        'customer_package_id',
        'package_hours_used',
        'cash_hours_used'
      ];
      const participantValues = [
        booking.id,
        participant.userId,
        participant.isPrimary === true, // Ensure boolean for PostgreSQL
        participant.actualPaymentStatus,
        participant.paymentAmount,
        participant.notes || '',
        participant.customerPackageId,
        participant.packageHoursUsed || 0,
        participant.cashHoursUsed || 0
      ];
      const { columns: participantInsertColumns, values: participantInsertValues } = appendCreatedBy(participantColumns, participantValues, actorId);
      const participantPlaceholders = participantInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
      const partInsert = await client.query(
        `INSERT INTO booking_participants (${participantInsertColumns.join(', ')}) VALUES (${participantPlaceholders}) RETURNING id`,
        participantInsertValues
      );
      // Persist this participant's cross-package draws scoped to its row id.
      if (participant._spilloverDraws && participant._spilloverDraws.length > 0) {
        await recordConsumptionLedger(client, {
          bookingId: booking.id,
          participantId: partInsert.rows[0].id,
          draws: participant._spilloverDraws,
        });
      }
    }
    
    // After booking is created, post any pending transactions linked to this booking
    for (const tx of pendingTransactions) {
      const metadata = {
        ...(tx.metadata || {}),
        bookingId: booking.id,
        actorId,
        source: tx.metadata?.source || 'group_booking_wizard'
      };

      try {
        await recordWalletTransaction({
          userId: tx.userId,
          amount: tx.amount,
          transactionType: tx.type,
          currency: tx.currency || DEFAULT_CURRENCY,
          status: tx.status || 'completed',
          description: tx.description,
          metadata,
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          createdBy: actorId,
          allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
          client
        });
      } catch (walletError) {
        logger.error('Failed to record wallet ledger entry for group booking charge', {
          bookingId: booking.id,
          userId: tx.userId,
          amount: tx.amount,
          error: walletError?.message
        });
        throw walletError;
      }
    }
    // Optionally, under feature flag, charge partial cash portion immediately
    if (BILLING_PARTIAL_PRECISION) {
      for (const pp of processedParticipants) {
        if (pp.actualPaymentStatus === 'partial' && pp.paymentAmount > 0 && pp.cashTransactionStatus !== 'completed') {
          try {
            await recordWalletTransaction({
              userId: pp.userId,
              amount: -Math.abs(pp.paymentAmount),
              transactionType: 'booking_charge',
              currency: pp.currency || DEFAULT_CURRENCY,
              status: 'completed',
              description: 'Group lesson cash portion',
              metadata: {
                bookingId: booking.id,
                actorId,
                source: 'group_partial_cash_portion'
              },
              relatedEntityType: 'booking',
              relatedEntityId: booking.id,
              createdBy: actorId,
              allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
              client
            });
          } catch (walletError) {
            logger.error('Failed to record wallet ledger entry for group partial cash portion', {
              bookingId: booking.id,
              userId: pp.userId,
              amount: pp.paymentAmount,
              error: walletError?.message
            });
            throw walletError;
          }
        }
      }
    }

    // Add equipment associations if any
    if (equipment_ids && equipment_ids.length > 0) {
      for (const equipment_id of equipment_ids) {
        await client.query(
          'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
          [booking.id, equipment_id]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete booking with participants for response
    const completeBookingQuery = `
      SELECT 
        b.*,
        json_agg(
          json_build_object(
            'userId', bp.user_id,
            'userName', u.name,
            'userEmail', u.email,
            'userPhone', u.phone,
            'isPrimary', bp.is_primary,
            'paymentStatus', bp.payment_status,
            'paymentAmount', bp.payment_amount,
            'customerPackageId', bp.customer_package_id,
            'notes', bp.notes
          )
        ) as participants
      FROM bookings b
      LEFT JOIN booking_participants bp ON b.id = bp.booking_id
      LEFT JOIN users u ON bp.user_id = u.id
      WHERE b.id = $1
      GROUP BY b.id
    `;
    
    const completeBookingResult = await client.query(completeBookingQuery, [booking.id]);
    const completeBooking = completeBookingResult.rows[0];
    if (completeBooking) {
      if (packageFallbacks.length > 0) {
        completeBooking.packageFallbacks = packageFallbacks;
      }

      try {
        await BookingUpdateCascadeService.cascadeBookingUpdate(completeBooking, { _custom_commission_changed: true });
      } catch (cascadeError) {
        logger.warn('Failed to cascade instructor earnings after group booking creation', {
          bookingId: completeBooking.id,
          error: cascadeError?.message
        });
      }
    }

    // Send notifications only if booking was created by student (not by staff)
    const createdByRole = req.user?.role;
    const staffRoles = ['admin', 'manager', 'instructor', 'owner'];
    const isStaffCreated = staffRoles.includes(createdByRole);

    if (!isStaffCreated) {
      try {
        await bookingNotificationService.sendBookingCreated({ bookingId: booking.id });
      } catch (notificationError) {
        logger.warn('Failed to dispatch booking notifications for group booking', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
    } else if (createdByRole === 'instructor') {
      // Instructor bookings go as pending — notify admins/managers for approval
      const instructorName = req.user?.name || req.user?.first_name || 'An instructor';
      const sessionDate = normalizedDate || date;
      const sessionTime = start_hour != null
        ? `${Math.floor(parseFloat(start_hour))}:${String(Math.round((parseFloat(start_hour) % 1) * 60)).padStart(2, '0')}`
        : '';
      try {
        await dispatchToStaff({
          type: 'new_booking_alert',
          title: 'Instructor Booking — Approval Needed',
          message: `${instructorName} created a ${bookingDuration}h group ${serviceName || 'lesson'} booking on ${sessionDate}${sessionTime ? ` at ${sessionTime}` : ''} — pending your approval.`,
          data: {
            bookingId: booking.id,
            instructorId: instructor_user_id || req.user?.id,
            instructorName,
            date: sessionDate,
            status: 'pending',
            cta: { label: 'Review Booking', href: `/calendars/lessons?bookingId=${booking.id}&date=${sessionDate}` }
          },
          excludeUserIds: [req.user?.id],
          roles: ['admin', 'manager', 'owner']
        });
      } catch (notificationError) {
        logger.warn('Failed to dispatch instructor pending group booking notification', {
          bookingId: booking.id,
          error: notificationError?.message
        });
      }
      // Real-time push to staff
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('staff', 'booking:pending_approval', {
            bookingId: booking.id,
            instructorName,
            serviceName: serviceName || 'Group Lesson',
            date: sessionDate,
            startTime: sessionTime,
            duration: bookingDuration,
            status: 'pending'
          });
        } catch (socketError) {
          logger.warn('Failed to emit instructor pending group booking socket event', { error: socketError?.message });
        }
      }
    } else {
      logger.info('Skipping booking notifications - group booking created by staff', {
        bookingId: booking.id,
        createdBy: actorId,
        role: createdByRole
      });
    }

    // Emit real-time event for booking creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:created', completeBooking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(201).json(completeBooking);
  } catch (err) {
    await client.query('ROLLBACK');
  logger.error('Error creating group booking:', err);
  logger.error('Request body for group booking failure', { body: req.body });
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to create group booking';
    let statusCode = 500;
    
    // Handle wallet-related errors
    if (err.message && (err.message.includes('Insufficient wallet balance') || err.message.includes('wallet'))) {
      errorMessage = err.message;
      statusCode = 400; // Bad request - business logic failure, not server error
    } else if (err.code) {
      switch (err.code) {
        case '23502': // NOT NULL violation
          errorMessage = 'Missing required field: ' + err.column;
          statusCode = 400;
          break;
        case '23503': // FOREIGN KEY violation
          errorMessage = 'Invalid reference: ' + err.detail;
          statusCode = 400;
          break;
        case '23514': // CHECK constraint violation
          if (err.constraint === 'chk_realistic_hours') {
            errorMessage = 'Invalid start time - must be between 6:00 and 23:00';
          } else {
            errorMessage = 'Data validation failed: ' + err.constraint;
          }
          statusCode = 400;
          break;
        case '22P02': // Invalid input syntax
          errorMessage = 'Invalid data format';
          statusCode = 400;
          break;
        default:
          errorMessage = 'Database error';
      }
    }
    
    res.status(statusCode).json({ error: errorMessage, code: err.code });
  } finally {
    client.release();
  }
});

// POST create a new booking from the calendar
router.post('/calendar', authenticateJWT, async (req, res) => {
  try {
    const {
      date, time, duration, instructorId, serviceId, user,
      amount, finalAmount, paymentStatus, checkinStatus, checkoutStatus, use_package, customerPackageId,
    } = req.body;
    
    const walletCurrencyRaw = req.body.wallet_currency || req.body.walletCurrency || req.body.currency;
    const requestedPaymentMethod = req.body.payment_method || req.body.paymentMethod || null;
    // Negative-balance override is role-derived only — never trusts req.body.allowNegativeBalance.
    const staffRolesForNegativeBalance = ['admin', 'manager', 'front_desk', 'receptionist', 'instructor'];
    const isStaffBooker = staffRolesForNegativeBalance.includes(req.user?.role);
    const isTrustedCustomer = req.user?.role === 'trusted_customer';
    const allowNegativeBalance = isStaffBooker || isTrustedCustomer;
    
    // Currency will be resolved later after we know the user ID
    let resolvedWalletCurrency = walletCurrencyRaw?.trim()?.toUpperCase() || null;

    if (!date || !time || !instructorId || !serviceId || !user) {
      return res.status(400).json({ error: 'Missing required booking information' });
    }

    // Allow booking for existing users identified by id (may have no email stored)
    if (!user.id && (!user.name || !user.email)) {
      return res.status(400).json({ error: 'Missing required user information (name and email)' });
    }

    // Convert time string (like "09:00") to decimal hours (like 9.0)
    const [hours, minutes] = time.split(':').map(Number);
    const start_hour = hours + (minutes / 60);

    // Use provided duration or default to 1 hour
    const bookingDuration = parseFloat(duration) || 1.0;

    // Find or create the student being booked
    let userId;
    if (user.id) {
      // Existing user selected from the system — look up by ID
      const userById = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);
      if (userById.rows.length > 0) {
        userId = userById.rows[0].id;
      }
    }
    if (!userId && user.email) {
      const userCheck = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [user.email]);
      if (userCheck.rows.length > 0) {
        userId = userCheck.rows[0].id;
      }
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      const actorId = resolveActorId(req);
      await client.query('BEGIN');

      // If user doesn't exist, create a new user record with student role
      if (!userId) {
        // Get student role ID
        const roleQuery = await client.query(
          'SELECT id FROM roles WHERE name = $1',
          ['student']
        );
        
        if (roleQuery.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'Student role not found in system' });
        }
        
        const studentRoleId = roleQuery.rows[0].id;
          // Staff-created (calendar flow) — pre-verified so the email_verified
          // login gate doesn't block staff-onboarded customers.
          const newUser = await client.query(
          `INSERT INTO users (name, email, phone, role_id, password_hash, email_verified, email_verified_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW(), NOW())
           RETURNING id`,
          [user.name, user.email, user.phone, studentRoleId, 'calendar_user_no_password']
        );
        userId = newUser.rows[0].id;
      }

      // Get user's preferred currency if not specified in request
      if (!resolvedWalletCurrency) {
        const userCurrencyResult = await client.query(
          'SELECT preferred_currency FROM users WHERE id = $1',
          [userId]
        );
        resolvedWalletCurrency = userCurrencyResult.rows[0]?.preferred_currency || DEFAULT_CURRENCY;
      }
      // Wallet transactions MUST use the system's storage currency (EUR).
      // preferred_currency is for display/price-lookup only, not for wallet storage.
      const walletTransactionCurrency = DEFAULT_CURRENCY;
        
      // Normalize date format to YYYY-MM-DD if it's not already
      const normalizedDate = typeof date === 'string' && date.includes('T') 
        ? date.split('T')[0] 
        : date;      // Check if the slot is still available (check for time conflicts)
      const slotCheck = await client.query(
        `SELECT id, start_hour, duration, (start_hour + duration) as end_hour
         FROM bookings 
         WHERE date = $1 
         AND instructor_user_id = $2
         AND status NOT IN ('cancelled', 'pending_payment')
         AND deleted_at IS NULL
         AND (
           (start_hour <= $3 AND (start_hour + duration) > $3) OR
           (start_hour >= $3 AND start_hour < ($3 + $4))
         )`,
        [normalizedDate, instructorId, parseFloat(start_hour), parseFloat(bookingDuration)]
      );
      
      if (slotCheck.rows.length > 0) {
        const conflictingBooking = slotCheck.rows[0];
        const requestedStartTime = `${Math.floor(start_hour).toString().padStart(2, '0')}:${Math.round((start_hour - Math.floor(start_hour)) * 60).toString().padStart(2, '0')}`;
        const requestedEndTime = `${Math.floor(start_hour + bookingDuration).toString().padStart(2, '0')}:${Math.round(((start_hour + bookingDuration) - Math.floor(start_hour + bookingDuration)) * 60).toString().padStart(2, '0')}`;
        const conflictStartTime = `${Math.floor(conflictingBooking.start_hour).toString().padStart(2, '0')}:${Math.round((conflictingBooking.start_hour - Math.floor(conflictingBooking.start_hour)) * 60).toString().padStart(2, '0')}`;
        const conflictEndTime = `${Math.floor(conflictingBooking.end_hour).toString().padStart(2, '0')}:${Math.round((conflictingBooking.end_hour - Math.floor(conflictingBooking.end_hour)) * 60).toString().padStart(2, '0')}`;
        
        // Get available time slots for suggestions
        const allBookingsQuery = await client.query(
          `SELECT start_hour, duration 
           FROM bookings 
           WHERE date = $1 
           AND instructor_user_id = $2
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           ORDER BY start_hour`,
          [normalizedDate, instructorId]
        );
        
        // Improved slot suggestion algorithm - find slots that don't conflict
        const suggestedSlots = [];
        const workingHours = { start: 8, end: 18 };
        const existingBookings = allBookingsQuery.rows.sort((a, b) => a.start_hour - b.start_hour);
        
        // Strategy 1: Look for slots after the conflicting booking ends
        const conflictingEnd = parseFloat(conflictingBooking.start_hour) + parseFloat(conflictingBooking.duration);
        
        // Find next available slot after the conflict with 30-minute buffer
        let searchStart = Math.ceil((conflictingEnd + 0.5) * 2) / 2;
        
        for (let hour = searchStart; hour <= workingHours.end - bookingDuration; hour += 0.5) {
          const slotEnd = hour + bookingDuration;
          let hasConflict = false;
          
          // Check if this slot conflicts with any existing booking
          for (const booking of existingBookings) {
            const bookingStart = parseFloat(booking.start_hour);
            const bookingEnd = parseFloat(booking.start_hour) + parseFloat(booking.duration);
            
            // Check for any overlap
            if ((hour < bookingEnd && slotEnd > bookingStart)) {
              hasConflict = true;
              break;
            }
          }
          
          if (!hasConflict) {
            const hours = Math.floor(hour);
            const minutes = Math.round((hour - hours) * 60);
            const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            const endHours = Math.floor(slotEnd);
            const endMinutes = Math.round((slotEnd - endHours) * 60);
            const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
            
            suggestedSlots.push({
              startTime: slotStartTime,
              endTime: slotEndTime,
              startHour: hour,
              duration: bookingDuration
            });
            
            // Available slot found (development logging)
          }
          
          if (suggestedSlots.length >= 2) break; // Get 2 slots after conflict
        }
        
        // Strategy 2: Look for slots before the conflicting booking starts (if we need more suggestions)
        if (suggestedSlots.length < 3) {
          const conflictingStart = parseFloat(conflictingBooking.start_hour);
          // Looking for slots before conflict (development logging)
          
          // Find available slot before the conflict
          for (let hour = workingHours.start; hour <= conflictingStart - bookingDuration; hour += 0.5) {
            const slotEnd = hour + bookingDuration;
            let hasConflict = false;
            
            // Check if this slot conflicts with any existing booking
            for (const booking of existingBookings) {
              const bookingStart = parseFloat(booking.start_hour);
              const bookingEnd = parseFloat(booking.start_hour) + parseFloat(booking.duration);
              
              // Check for any overlap
              if ((hour < bookingEnd && slotEnd > bookingStart)) {
                hasConflict = true;
                break;
              }
            }
            
            if (!hasConflict && slotEnd <= conflictingStart) { // Ensure it ends before conflict starts
              const hours = Math.floor(hour);
              const minutes = Math.round((hour - hours) * 60);
              const slotStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
              
              const endHours = Math.floor(slotEnd);
              const endMinutes = Math.round((slotEnd - endHours) * 60);
              const slotEndTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
              
              suggestedSlots.push({
                startTime: slotStartTime,
                endTime: slotEndTime,
                startHour: hour,
                duration: bookingDuration
              });
              
              // Available slot found before conflict (development logging)
            }
            
            if (suggestedSlots.length >= 3) break; // Limit to 3 total suggestions
          }
        }
        
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Time slot unavailable',
          details: {
            message: `The requested time slot ${requestedStartTime}-${requestedEndTime} conflicts with an existing booking from ${conflictStartTime}-${conflictEndTime}.`,
            conflictingSlot: {
              startTime: conflictStartTime,
              endTime: conflictEndTime
            },
            requestedSlot: {
              startTime: requestedStartTime,
              endTime: requestedEndTime
            },
            suggestedSlots: suggestedSlots,
            date: normalizedDate
          }
        });
      }
        // Get service information to determine duration if available
      const serviceQuery = await client.query(
        `SELECT duration, price, name, currency, discipline_tag, lesson_category_tag FROM services WHERE id = $1`,
        [serviceId]
      );
      // Use the pre-scheduled block duration if it exists, otherwise use service duration or default
        let serviceDuration = bookingDuration;
        let servicePrice = 0;
        let svcName = null;
        let svcDisciplineTag = null;
        let svcLessonCategoryTag = null;
        
        // Get user's preferred currency for billing
        let userBillingCurrency = resolvedWalletCurrency || DEFAULT_CURRENCY;
        if (userId && !resolvedWalletCurrency) {
          const userCurrencyQuery = await client.query(
            'SELECT preferred_currency FROM users WHERE id = $1',
            [userId]
          );
          if (userCurrencyQuery.rows.length > 0 && userCurrencyQuery.rows[0].preferred_currency) {
            userBillingCurrency = userCurrencyQuery.rows[0].preferred_currency;
          }
        }
        
        if (serviceQuery.rows.length > 0) {
          const row = serviceQuery.rows[0];
          svcName = row.name || null;
          svcDisciplineTag = row.discipline_tag || null;
          svcLessonCategoryTag = row.lesson_category_tag || null;
          if (!duration) {
            serviceDuration = row.duration || bookingDuration;
          }
          // Look up price in user's preferred currency
          const priceResult = await getServicePriceInCurrency(serviceId, userBillingCurrency);
          if (priceResult && priceResult.price > 0) {
            servicePrice = priceResult.price;
          } else if (row.price !== undefined && row.price !== null) {
            // Fallback to default service price
            servicePrice = parseFloat(row.price) || 0;
          }
        }

      // Handle package vs individual payment choice
  let finalPaymentStatus = 'paid'; // Pay-and-go: default to paid for individual payments
  let finalFinalAmount = parseFloat(finalAmount || amount || 0);
    let individualChargeEntry = null;

  // Server-side price recalculation: always compute the correct amount from service price × duration
  // for individual (non-package) payments, overriding whatever the frontend sent.
  // This prevents stale frontend state from causing incorrect charges.
  const serviceDurationHours = serviceQuery.rows.length > 0 ? (parseFloat(serviceQuery.rows[0].duration) || 0) : 0;
  if (use_package !== true && servicePrice > 0) {
    const dur = bookingDuration || 1;
    const serverCalculatedAmount = serviceDurationHours > 0
      ? parseFloat(((servicePrice / serviceDurationHours) * dur).toFixed(2))
      : servicePrice;
    finalFinalAmount = serverCalculatedAmount;
  }
      
  let chosenPackageId = customerPackageId || null;
  // Track the exact package/cash hour split so delete/cancel/duration-edit can
  // restore precisely instead of guessing `duration`. NULL = not package-linked.
  let packageHoursUsedForBooking = null;
  let cashHoursUsedForBooking = null;
  let calendarSpillover = null; // ledger draws to persist after the booking row exists
  if (use_package === true) {
        // ── Cross-package FIFO spillover ────────────────────────────────────
        // Draw hours oldest-first across the customer's compatible packages,
        // overflowing to cash only when the pool is exhausted.
        calendarSpillover = await consumeAcrossPackages(client, {
          customerId: userId,
          hoursNeeded: parseFloat(serviceDuration),
          matchCriteria: {
            serviceName: svcName,
            lessonCategoryTag: svcLessonCategoryTag,
            disciplineTag: svcDisciplineTag,
          },
          requestedPackageId: customerPackageId || null,
          asOfDate: normalizedDate,
        });

        if (calendarSpillover.draws.length === 0) {
          calendarSpillover = null;
          if (customerPackageId) {
            // Staff picked a package but it (and the pool) lacks hours. Earlier
            // lessons in a multi-submit can deplete a package; fall back to wallet
            // for this lesson rather than aborting the whole multi-booking.
            logger.info('Calendar booking: no usable package hours, falling back to wallet', {
              customerPackageId, userId, date: normalizedDate, serviceName: svcName
            });
            chosenPackageId = null;
            finalPaymentStatus = 'paid';
            if (servicePrice > 0) {
              const dur = bookingDuration || 1;
              finalFinalAmount = serviceDurationHours > 0
                ? parseFloat(((servicePrice / serviceDurationHours) * dur).toFixed(2))
                : servicePrice;
            }
            if (finalFinalAmount > 0) {
              individualChargeEntry = {
                userId,
                amount: -Math.abs(finalFinalAmount),
                transactionType: 'booking_charge',
                currency: walletTransactionCurrency,
                status: 'completed',
                description: `Lesson charge (package unavailable): ${normalizedDate} ${time} (${serviceDuration}h)`,
                metadata: {
                  bookingDate: normalizedDate, startHour: time, durationHours: serviceDuration,
                  paymentMethod: requestedPaymentMethod || 'wallet', source: 'calendar_booking_charge_pkg_fallback'
                }
              };
            }
          } else {
            await client.query('ROLLBACK');
            return res.status(400).json({
              error: 'Insufficient or mismatched package',
              message: svcName
                ? `No active ${svcName} package available. Choose a matching package or pay individually.`
                : 'No active package available. Choose a package or pay individually.'
            });
          }
        } else {
          chosenPackageId = calendarSpillover.primaryPackageId;
          packageHoursUsedForBooking = calendarSpillover.packageHoursTotal;
          cashHoursUsedForBooking = calendarSpillover.cashHours;
          if (calendarSpillover.cashHours > 0.0001) {
            finalPaymentStatus = 'partial';
            const hourly = servicePrice || (parseFloat(amount) || 0);
            finalFinalAmount = parseFloat((hourly * calendarSpillover.cashHours).toFixed(2));
            individualChargeEntry = {
              userId,
              amount: -Math.abs(finalFinalAmount),
              transactionType: 'booking_charge',
              currency: walletTransactionCurrency,
              status: 'completed',
              description: `Partial lesson cash leg (${calendarSpillover.cashHours}h): ${normalizedDate} ${time} (${serviceDuration}h total)`,
              metadata: {
                bookingDate: normalizedDate, startHour: time,
                cashHours: calendarSpillover.cashHours, packageHours: calendarSpillover.packageHoursTotal,
                durationHours: serviceDuration, paymentMethod: requestedPaymentMethod || 'wallet',
                source: 'calendar_partial_cash_leg'
              }
            };
          } else {
            finalPaymentStatus = 'package';
            finalFinalAmount = 0;
          }
        }
      } else if (use_package === false && finalFinalAmount > 0) {
        individualChargeEntry = {
          userId,
          amount: -Math.abs(finalFinalAmount),
          transactionType: 'booking_charge',
          currency: walletTransactionCurrency,
          status: 'completed',
          description: `Individual lesson charge: ${normalizedDate} ${time} (${serviceDuration}h)`,
          metadata: {
            bookingDate: normalizedDate,
            startHour: time,
            durationHours: serviceDuration,
            paymentMethod: requestedPaymentMethod || 'wallet',
            source: 'calendar_booking_charge'
          }
        };
        finalPaymentStatus = 'paid'; // Mark as paid since we charged immediately
      } else {
        finalPaymentStatus = 'paid'; // Pay-and-go: even zero amount is considered paid
      }

      // Staff roles automatically confirm bookings (admin, manager, front_desk)
      const staffRolesForAutoConfirm = ['admin', 'manager', 'front_desk'];
      const calendarBookingStatus = staffRolesForAutoConfirm.includes(req.user?.role) ? 'confirmed' : 'pending';

      // Create the booking with comprehensive defaults to minimize NULLs
      const bookingColumns = [
        'student_user_id',
        'instructor_user_id',
        'customer_user_id',
        'date',
        'start_hour',
        'duration',
        'service_id',
        'status',
        'notes',
        'payment_status',
        'amount',
        'discount_percent',
        'discount_amount',
        'final_amount',
        'checkin_status',
        'checkout_status',
        'location',
        'weather_conditions',
        'feedback_comments',
        'checkin_notes',
        'checkout_notes',
        'customer_package_id',
        'package_hours_used',
        'cash_hours_used',
        'created_at',
        'updated_at'
      ];
      const bookingValues = [
        userId,
        instructorId,
        userId,
        normalizedDate,
        parseFloat(start_hour),
        parseFloat(serviceDuration),
        serviceId,
        calendarBookingStatus,
        user.notes || '',
        finalPaymentStatus,
        parseFloat(finalFinalAmount) || 0.0,
        0.0,
        0.0,
        parseFloat(finalFinalAmount) || 0.0,
        checkinStatus || 'pending',
        checkoutStatus || 'pending',
        'TBD',
        'Good',
        '',
        '',
        '',
        chosenPackageId,
        packageHoursUsedForBooking,
        cashHoursUsedForBooking,
        new Date(),
        new Date()
      ];
      const { columns: bookingInsertColumns, values: bookingInsertValues } = appendCreatedBy(bookingColumns, bookingValues, actorId);
      const bookingPlaceholders = bookingInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
      const booking = await client.query(
        `INSERT INTO bookings (${bookingInsertColumns.join(', ')}) VALUES (${bookingPlaceholders}) RETURNING *`,
        bookingInsertValues
      );
      const bookingId = booking.rows[0].id;

      // Persist the cross-package draws now that the booking id exists.
      if (calendarSpillover && calendarSpillover.draws.length > 0) {
        await recordConsumptionLedger(client, {
          bookingId,
          participantId: null,
          draws: calendarSpillover.draws,
        });
      }

      await applySelfStudentCommissionIfMatch(client, booking.rows[0]);

      if (individualChargeEntry) {
        const metadata = {
          ...(individualChargeEntry.metadata || {}),
          bookingId,
          actorId
        };

        try {
          await recordWalletTransaction({
            ...individualChargeEntry,
            metadata,
            relatedEntityType: 'booking',
            relatedEntityId: bookingId,
            createdBy: actorId,
            allowNegative: allowNegativeBalance === true, // Allow negative balance if explicitly enabled
            client
          });
        } catch (walletError) {
          logger.error('Failed to record wallet ledger entry for calendar booking charge', {
            bookingId,
            userId: individualChargeEntry.userId,
            amount: individualChargeEntry.amount,
            error: walletError?.message
          });
          throw walletError;
        }
      }
        // Commit transaction
      await client.query('COMMIT');

      // Create the instructor_earnings snapshot now so payroll / commission
      // views see a non-zero value immediately. Without this, the cascade
      // only fires on a subsequent edit and the booking sits with NULL
      // earnings (displays as 0) until then.
      try {
        await BookingUpdateCascadeService.cascadeBookingUpdate(
          booking.rows[0],
          { _custom_commission_changed: true }
        );
      } catch (cascadeError) {
        logger.warn('Failed to cascade instructor earnings after calendar booking creation', {
          bookingId: booking.rows[0].id,
          error: cascadeError?.message
        });
      }

      // Calculate startTime and endTime for response
      const hours = Math.floor(start_hour);
      const minutes = Math.round((start_hour - hours) * 60);
      const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      const endHours = Math.floor(start_hour + serviceDuration);
      const endMinutes = Math.round(((start_hour + serviceDuration) - endHours) * 60);
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
      
      // Notify admins/managers when instructor creates a pending booking
      const createdByRole = req.user?.role;
      if (createdByRole === 'instructor') {
        const instructorName = req.user?.name || req.user?.first_name || 'An instructor';
        try {
          await dispatchToStaff({
            type: 'new_booking_alert',
            title: 'Instructor Booking — Approval Needed',
            message: `${instructorName} created a ${serviceDuration}h ${svcName || 'lesson'} booking on ${normalizedDate} at ${startTime} — pending your approval.`,
            data: {
              bookingId: booking.rows[0].id,
              instructorId: instructorId || req.user?.id,
              instructorName,
              date: normalizedDate,
              status: 'pending',
              cta: { label: 'Review Booking', href: `/calendars/lessons?bookingId=${booking.rows[0].id}&date=${normalizedDate}` }
            },
            excludeUserIds: [req.user?.id],
            roles: ['admin', 'manager', 'owner']
          });
        } catch (notificationError) {
          logger.warn('Failed to dispatch instructor pending calendar booking notification', {
            bookingId: booking.rows[0].id,
            error: notificationError?.message
          });
        }
        // Real-time push to admin/manager roles
        if (req.socketService) {
          try {
            const pendingPayload = {
              bookingId: booking.rows[0].id,
              instructorName,
              serviceName: svcName || 'Lesson',
              date: normalizedDate,
              startTime,
              duration: serviceDuration,
              status: 'pending'
            };
            req.socketService.emitToChannel('role:admin', 'booking:pending_approval', pendingPayload);
            req.socketService.emitToChannel('role:manager', 'booking:pending_approval', pendingPayload);
            req.socketService.emitToChannel('role:owner', 'booking:pending_approval', pendingPayload);
          } catch (socketError) {
            logger.warn('Failed to emit instructor pending calendar booking socket event', { error: socketError?.message });
          }
        }
      }

      // Emit real-time event for booking creation so other clients refresh
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:created', {
            id: booking.rows[0].id,
            date: normalizedDate,
            startTime,
            endTime,
            time: startTime,
            duration: serviceDuration,
            instructor_user_id: instructorId,
            service_id: serviceId,
            student_user_id: userId,
            status: calendarBookingStatus
          });
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'created' });
        } catch (socketError) {
          logger.warn('Failed to emit socket event', socketError);
        }
      }

      // Notify the assigned instructor (in-app + Telegram). We notify even
      // when the creator IS the assigned instructor, since many users wear
      // both manager and instructor hats and want the Telegram confirmation
      // for their own bookings too.
      if (instructorId) {
        bookingNotificationService.notifyInstructorAssigned({
          bookingId: booking.rows[0].id,
          instructorUserId: instructorId
        }).catch((err) => logger.warn('notifyInstructorAssigned (calendar) error', { error: err?.message }));
      }

      res.status(201).json({
        success: true,
        id: booking.rows[0].id,
        bookingId: booking.rows[0].id,
        message: calendarBookingStatus === 'pending' ? 'Booking submitted — pending approval' : 'Booking confirmed successfully',
        status: calendarBookingStatus,
        date: normalizedDate,
        startTime,
        endTime,
        time: startTime,
        duration: serviceDuration,
        instructorId,
        userId,
        serviceId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to create booking', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE a booking
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor', 'front_desk', 'receptionist']), rateLimitBookingUpdates, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the current booking data before update to track changes
    // deleted_at guard: editing a soft-deleted booking would let the cascade
    // re-create the instructor_earnings/commission rows the delete flow removed.
    // FOR UPDATE serialises concurrent edits of the SAME booking so two rapid
    // price edits can't interleave their financial cascades (last-write-wins on
    // earnings/commission). Different bookings don't contend.
    const currentBookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (currentBookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    const currentBooking = currentBookingResult.rows[0];
    
    const {
      date, start_hour, duration, student_user_id, instructor_user_id,
      status, payment_status, amount, final_amount, notes, location, equipment_ids,
      instructor_commission, instructor_commission_type,
      checkout_status, checkout_time, checkout_notes,
      checkin_status, checkin_time, checkin_notes
    } = req.body;

    // Capture the PRE-edit custom commission value NOW, before the delete/insert
    // below rewrites it. Reading it afterwards (as the old code did) returns the
    // just-inserted NEW value, so a commission-only edit never registered as a
    // change and the cascade never recomputed instructor earnings for it.
    let preEditCustomCommissionValue = null;
    if (instructor_commission !== undefined) {
      const pccRes = await client.query(
        'SELECT commission_value FROM booking_custom_commissions WHERE booking_id = $1',
        [req.params.id]
      );
      preEditCustomCommissionValue = pccRes.rows.length > 0
        ? parseFloat(pccRes.rows[0].commission_value)
        : null;
    }

    // Keep `final_amount` in sync with `amount` whenever the caller updates the
    // price. The display layer reads `final_amount` first, so leaving it stale
    // makes a successful price edit look like nothing changed.
    const finalAmountToWrite =
      final_amount !== undefined ? final_amount
      : amount !== undefined ? amount
      : null;

    const updateBookingQuery = `
      UPDATE bookings
      SET
        date = COALESCE($1, date),
        start_hour = COALESCE($2, start_hour),
        duration = COALESCE($3, duration),
        student_user_id = COALESCE($4, student_user_id),
        instructor_user_id = COALESCE($5, instructor_user_id),
        status = COALESCE($6, status),
        payment_status = COALESCE($7, payment_status),
        amount = COALESCE($8, amount),
        final_amount = COALESCE($9, final_amount),
        notes = COALESCE($10, notes),
        location = COALESCE($11, location),
        checkout_status = COALESCE($12, checkout_status),
        checkout_time = COALESCE($13, checkout_time),
        checkout_notes = COALESCE($14, checkout_notes),
        checkin_status = COALESCE($15, checkin_status),
        checkin_time = COALESCE($16, checkin_time),
        checkin_notes = COALESCE($17, checkin_notes),
        updated_at = NOW()
      WHERE id = $18
      RETURNING *
    `;

    const bookingResult = await client.query(updateBookingQuery, [
      date, start_hour, duration, student_user_id, instructor_user_id,
      status, payment_status, amount, finalAmountToWrite, notes, location,
      checkout_status, checkout_time, checkout_notes,
      checkin_status, checkin_time, checkin_notes,
      req.params.id
    ]);

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];

    // Reconcile linked package hours when the booking's duration changes.
    // Without this, editing a 4h package-paid lesson down to 3.5h would leave
    // customer_packages.used_hours at 4 — the package would appear "fully used"
    // even though only 3.5h were consumed (root cause of issue #1, May 2026).
    let packageHourAdjustments = [];
    if (duration !== undefined && duration !== null) {
      const oldDuration = parseFloat(currentBooking.duration) || 0;
      const newDuration = parseFloat(duration) || 0;
      if (Math.abs(newDuration - oldDuration) > 0.0001) {
        try {
          packageHourAdjustments = await reconcilePackageHoursOnDurationChange(
            client, booking, oldDuration, newDuration, currentBooking
          );
          if (packageHourAdjustments.length > 0) {
            logger.info('Reconciled customer_packages.used_hours after duration edit', {
              bookingId: booking.id,
              oldDuration,
              newDuration,
              adjustments: packageHourAdjustments.map(a => ({
                packageId: a.packageId,
                hoursConsumed: a.hoursConsumed,
                hoursRestored: a.hoursRestored,
                newUsedHours: a.newUsedHours,
                newRemainingHours: a.newRemainingHours,
              })),
            });
          }
        } catch (reconcileErr) {
          logger.error('Failed to reconcile package hours on duration edit', {
            bookingId: booking.id, oldDuration, newDuration, error: reconcileErr.message,
          });
          // Fail the whole update — leaving the package out of sync is exactly
          // the bug we're trying to prevent.
          throw reconcileErr;
        }
      }
    }

    // Transition INTO 'cancelled' via the general edit: run the same cleanup as
    // the dedicated status route (PATCH /:id/status). Without this, an edit that
    // sets status='cancelled' left package hours consumed, wallet charges
    // unrefunded, an unpaid instructor_earnings row and a 'pending' manager
    // commission stranded on the cancelled lesson.
    if (status === 'cancelled' && currentBooking.status !== 'cancelled') {
      if ((parseFloat(booking.duration) || 0) > 0) {
        await restoreBookingPackageHours(client, booking);
      }
      if (booking.student_user_id) {
        await refundBookingNetChargesPerUser(client, booking, {
          transactionType: 'booking_cancelled_refund',
          reason: 'booking_cancelled',
          actorId: req.user.id,
        });
      }
      await clearInstructorEarningsForBooking(client, booking.id);
      await client.query(
        `UPDATE manager_commissions
            SET status = 'cancelled',
                notes = COALESCE(notes || ' | ', '') || 'Cancelled: Booking cancelled via edit',
                updated_at = NOW()
          WHERE source_type = 'booking' AND source_id = $1 AND status = 'pending'`,
        [String(booking.id)]
      );
      await client.query(
        `UPDATE bookings SET canceled_at = CURRENT_TIMESTAMP WHERE id = $1 AND canceled_at IS NULL`,
        [booking.id]
      );
    }

    // Fan out price change to siblings on group / semi-private bookings.
    // Updates every participant's per-head share so the booking total and the
    // sum of participant amounts stay in sync. For already-paid participants,
    // also issues a wallet charge or refund for the difference between the old
    // and new share, so a price edit settles the difference instead of leaving
    // a silent gap. Package and refunded rows are skipped (no money moves).
    if (amount !== undefined && amount !== null) {
      const newTotal = parseFloat(amount) || 0;

      // ── Model A: single booking row with N booking_participants ──────────
      const partsRes = await client.query(
        `SELECT id, user_id, payment_status, payment_amount
           FROM booking_participants
          WHERE booking_id = $1`,
        [booking.id]
      );
      const participants = partsRes.rows;
      if (participants.length > 1) {
        // Split the new cash total across only the CASH-paying participants
        // (G4). Package participants owe €0 cash and must NOT dilute the per-head
        // share (the old code divided by ALL participants, undersizing each cash
        // payer's share); refunded participants are out.
        const cashPayers = participants.filter(
          (p) => p.payment_status === 'paid' || p.payment_status === 'partial'
        );
        const divisor = cashPayers.length || 1;
        const perParticipant = Math.round((newTotal / divisor) * 100) / 100;

        for (const p of cashPayers) {
          const oldShare = parseFloat(p.payment_amount) || 0;
          const diff = perParticipant - oldShare;

          // Settle the delta on the wallet for EVERY cash payer — 'paid' AND
          // 'partial' (the old code only settled 'paid', so a 'partial'
          // participant's recorded share changed with no money movement).
          if (diff !== 0 && p.user_id) {
            try {
              await recordWalletTransaction({
                userId: p.user_id,
                amount: -diff,
                availableDelta: -diff,
                transactionType: diff > 0 ? 'booking_charge' : 'booking_charge_adjustment',
                status: 'completed',
                direction: diff > 0 ? 'debit' : 'credit',
                description: diff > 0
                  ? 'Price increase reconciliation for shared booking'
                  : 'Price decrease reconciliation for shared booking',
                metadata: {
                  bookingId: booking.id,
                  reason: 'price_edit_reconciliation',
                  oldShare,
                  newShare: perParticipant
                },
                entityType: 'booking',
                relatedEntityType: 'booking',
                relatedEntityId: booking.id,
                bookingId: booking.id,
                createdBy: req.user?.id || null,
                allowNegative: true,
                client
              });
            } catch (walletErr) {
              logger.warn('Wallet reconciliation failed for participant on price edit (non-blocking)', {
                bookingId: booking.id,
                participantId: p.id,
                error: walletErr.message
              });
            }
          }

          await client.query(
            `UPDATE booking_participants
                SET payment_amount = $1, updated_at = NOW()
              WHERE id = $2`,
            [perParticipant, p.id]
          );
        }
      }

      // ── Model B: group_bookings master + group_booking_participants ──────
      const groupRes = await client.query(
        `SELECT id, max_participants FROM group_bookings WHERE booking_id = $1 LIMIT 1`,
        [booking.id]
      );
      if (groupRes.rows.length > 0) {
        const groupId = groupRes.rows[0].id;
        const max = parseInt(groupRes.rows[0].max_participants, 10) || 1;
        const pricePerPerson = Math.round((newTotal / max) * 100) / 100;
        await client.query(
          `UPDATE group_bookings
              SET total_amount = $1, price_per_person = $2, updated_at = NOW()
            WHERE id = $3`,
          [newTotal, pricePerPerson, groupId]
        );
        await client.query(
          `UPDATE group_booking_participants
              SET amount_due = $1, updated_at = NOW()
            WHERE group_booking_id = $2
              AND payment_status NOT IN ('paid', 'refunded')`,
          [pricePerPerson, groupId]
        );
      }
    }

    // Keep any PENDING bank-transfer receipt in sync whenever final_amount
    // actually changed — whether from an explicit price edit OR a reconcile-driven
    // duration edit on a partial booking (which rewrites the cash leg above). The
    // receipt amount is captured at booking creation; without this, editing an
    // unpaid booking and then approving the transfer charges the stale original
    // amount (the approval posts receipt.amount, not booking.final_amount). Gate
    // on the REAL old→new delta (not request params) so reconcile-only changes
    // are covered. Rescaling proportionally preserves a deposit receipt's ratio.
    // Approved/rejected receipts are untouched (status != 'pending').
    {
      const oldFinalForReceipt = parseFloat(currentBooking.final_amount ?? currentBooking.amount) || 0;
      const newFinalForReceipt = parseFloat(booking.final_amount ?? booking.amount) || 0;
      if (oldFinalForReceipt > 0 && Math.abs(newFinalForReceipt - oldFinalForReceipt) > 0.009) {
        const receiptRatio = newFinalForReceipt / oldFinalForReceipt;
        await client.query(
          `UPDATE bank_transfer_receipts
              SET amount = ROUND(amount * $1::numeric, 2), updated_at = NOW()
            WHERE booking_id = $2 AND status = 'pending'`,
          [receiptRatio, booking.id]
        );
      }
    }

    // Handle custom commission rate if provided
    if (instructor_commission !== undefined && instructor_user_id) {
      // First, delete any existing custom commission for this booking
      await client.query('DELETE FROM booking_custom_commissions WHERE booking_id = $1', [booking.id]);
      
      // If commission is provided and different from default, insert custom commission
      // Only proceed if we have a service_id
      if (instructor_commission !== null && instructor_commission !== '' && booking.service_id) {
        const commissionId = uuidv4();
        
        // Resolve the commission type: use explicitly provided type, or look up from instructor's settings
        let resolvedCommissionType = instructor_commission_type;
        if (!resolvedCommissionType) {
          const typeResult = await client.query(`
            SELECT COALESCE(
              isc.commission_type,
              icr.rate_type,
              idc.commission_type,
              'fixed'
            ) as commission_type
            FROM users u
            LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = u.id AND isc.service_id = $2
            LEFT JOIN instructor_category_rates icr ON icr.instructor_id = u.id 
              AND icr.lesson_category = (SELECT lesson_category_tag FROM services WHERE id = $2)
            LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = u.id
            WHERE u.id = $1
          `, [instructor_user_id, booking.service_id]);
          resolvedCommissionType = typeResult.rows[0]?.commission_type || 'fixed';
        }
        
        await client.query(`
          INSERT INTO booking_custom_commissions 
          (id, booking_id, instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [commissionId, booking.id, instructor_user_id, booking.service_id, resolvedCommissionType, instructor_commission]);
      }
    }    // Update equipment associations if provided
    if (equipment_ids) {
      // Remove current associations
      await client.query('DELETE FROM booking_equipment WHERE booking_id = $1', [booking.id]);
      
      // Add new associations
      if (equipment_ids.length > 0) {
        for (const equipment_id of equipment_ids) {
          await client.query(
            'INSERT INTO booking_equipment (booking_id, equipment_id) VALUES ($1, $2)',
            [booking.id, equipment_id]
          );
        }
      }
    }
    
    // Handle package hour deduction when booking is completed
    if (status === 'completed') {
      const bookingDuration = parseFloat(booking.duration) || 1;
      // Fetch service name for matching packages
      let svcName = null;
      if (booking.service_id) {
        try {
          const sres = await client.query('SELECT name FROM services WHERE id = $1', [booking.service_id]);
          svcName = sres.rows[0]?.name || null;
        } catch {}
      }

      // 1) PACKAGE DEDUCTION CONSOLIDATION FIX:
      // Package hours should ONLY be deducted during booking creation, NOT on completion
      // This prevents double deduction which was causing package hour inconsistencies
      if (booking.student_user_id) {
        // Only update last_used_date if this was a package booking to track usage
        if (booking.payment_status === 'package' && booking.customer_package_id) {
          try {
            await client.query(
              'UPDATE customer_packages SET last_used_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [booking.date, booking.customer_package_id]
            );
          } catch (e) {
            logger.warn('Failed to update package last_used_date', { error: e.message });
          }
        }
      }

      // 2) GROUP BOOKING PACKAGE DEDUCTION CONSOLIDATION FIX:
      // Similar to single bookings, package hours should only be deducted at creation, not completion
      // This prevents double deduction for group booking participants
      try {
        // Only update last_used_date for participants who used packages (for tracking purposes)
        const participantsRes = await client.query(
          'SELECT user_id, customer_package_id, payment_status FROM booking_participants WHERE booking_id = $1',
          [booking.id]
        );
        
        let packageUsers = 0;
        for (const participant of participantsRes.rows) {
          if (participant.payment_status === 'package') {
            packageUsers++;
            
            // Update last_used_date for package tracking (no hour deduction)
            if (participant.customer_package_id) {
              try {
                await client.query(
                  'UPDATE customer_packages SET last_used_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                  [booking.date, participant.customer_package_id]
                );
              } catch (e) {
                logger.warn('Failed to update last_used_date for participant package', { packageId: participant.customer_package_id, error: e.message });
              }
            }
          }
        }
        
        // Update booking payment status if participants used packages
        if (packageUsers > 0) {
          const totalParticipants = participantsRes.rows.length;
          const newStatus = packageUsers === totalParticipants ? 'package' : 'partial';
          await client.query(
            'UPDATE bookings SET payment_status = $1, updated_at = NOW() WHERE id = $2',
            [newStatus, booking.id]
          );
        }
        
      } catch (e) {
        logger.warn('Group booking package last_used_date update failed', { error: e.message });
      }
    }

    // ── Financial cascade — runs SYNCHRONOUSLY inside THIS transaction ────────
    // Discount rebase, instructor earnings, manager commission, customer wallet
    // settlement and package recalculation all commit atomically with the price
    // edit. Previously this ran in a fire-and-forget setImmediate AFTER COMMIT
    // with a misleading "(will retry)" log and no actual retry: a failure left
    // the booking showing the new price while earnings/commission/balance stayed
    // permanently stale (split-brain), and an immediate refetch could read
    // pre-cascade values. Running in-transaction (strict mode) means any failure
    // rolls the whole edit back, so the books are never left inconsistent.
    const bookingForCascade =
      (await client.query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0] || booking;

    const cascadeChanges = {};
    const cascadeCriticalFields = [
      'final_amount', 'amount', 'duration',
      'instructor_user_id', 'service_id', 'student_user_id', 'status',
    ];
    cascadeCriticalFields.forEach((field) => {
      if (currentBooking[field] !== bookingForCascade[field]) {
        cascadeChanges[field] = bookingForCascade[field];
        cascadeChanges._previous = cascadeChanges._previous || {};
        cascadeChanges._previous[field] = currentBooking[field];
      }
    });

    // Custom commission change detection — compare the value captured BEFORE the
    // delete/insert (preEditCustomCommissionValue) against the requested value, so
    // a real commission change is detected and triggers the earnings recompute.
    if (instructor_commission !== undefined) {
      const oldCommissionValue = preEditCustomCommissionValue;
      const newCommissionValue = instructor_commission !== null && instructor_commission !== ''
        ? parseFloat(instructor_commission)
        : null;
      if (oldCommissionValue !== newCommissionValue) {
        cascadeChanges._custom_commission_changed = true;
        cascadeChanges.instructor_commission = newCommissionValue;
        cascadeChanges._previous = cascadeChanges._previous || {};
        cascadeChanges._previous.instructor_commission = oldCommissionValue;
      }
    }

    if (Object.keys(cascadeChanges).length > 0) {
      // The cascade's customer-wallet settlement needs the PRE-edit payment
      // status (not just whether it changed) to know whether the reconcile path
      // already settled the cash leg for a package/partial duration edit.
      cascadeChanges._previousPaymentStatus = currentBooking.payment_status;
      // No try/catch: a cascade failure must abort the whole edit (handled by the
      // outer catch's ROLLBACK), not commit a half-applied price change.
      await BookingUpdateCascadeService.cascadeBookingUpdate(
        bookingForCascade, cascadeChanges, { client, strict: true }
      );
    }

    await client.query('COMMIT');

    // Get updated booking data to return in response (including payment_status changes)
    const updatedBookingResult = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [booking.id]
    );
    const updatedBooking = updatedBookingResult.rows[0];

    const previousStatus = (currentBooking.status || '').toLowerCase();
    const nextStatus = (updatedBooking.status || '').toLowerCase();
    const shouldQueueRatingReminder =
      COMPLETED_BOOKING_STATUSES.has(nextStatus) && !COMPLETED_BOOKING_STATUSES.has(previousStatus);

    if (shouldQueueRatingReminder) {
      const studentId = updatedBooking.student_user_id || updatedBooking.customer_user_id;
      if (studentId) {
        const instructorId = updatedBooking.instructor_user_id || null;
        const serviceId = updatedBooking.service_id || null;
        const bookingId = updatedBooking.id;
        const lessonDate = updatedBooking.date ? String(updatedBooking.date).slice(0, 10) : null;

        setImmediate(async () => {
          try {
            const [instructorRes, serviceRes] = await Promise.all([
              instructorId
                ? pool.query('SELECT name, profile_image_url FROM users WHERE id = $1', [instructorId])
                : Promise.resolve({ rows: [] }),
              serviceId
                ? pool.query('SELECT service_type, category, name FROM services WHERE id = $1', [serviceId])
                : Promise.resolve({ rows: [] })
            ]);

            const instructorRow = instructorRes.rows?.[0] || null;
            const instructorName = instructorRow?.name || null;
            const instructorAvatar = instructorRow?.profile_image_url || null;
            const serviceRow = serviceRes.rows?.[0] || null;
            const serviceType = resolveServiceType(serviceRow);
            const serviceName = serviceRow?.name || null;

            const reminderResult = await queueRatingReminder({
              bookingId,
              studentId,
              instructorId,
              instructorName,
              instructorAvatar,
              serviceId,
              serviceName,
              serviceType,
              lessonDate,
              lessonStartHour: updatedBooking.start_hour,
              lessonDurationHours: updatedBooking.duration
            });

            if (!reminderResult.queued && !['already-rated', 'already-queued'].includes(reminderResult.reason)) {
              logger.warn('Rating reminder was not queued after booking completion', {
                bookingId,
                studentId,
                instructorId,
                reason: reminderResult.reason,
                error: reminderResult.error || null
              });
            }
          } catch (reminderError) {
            logger.warn('Failed to queue rating reminder after booking completion', {
              bookingId,
              studentId,
              instructorId,
              error: reminderError.message
            });
          }

          // Fire-and-forget manager commission calculation
          try {
            const { recordBookingCommission } = await import('../services/managerCommissionService.js');
            await recordBookingCommission({
              ...updatedBooking,
              student_name: null, // Will be fetched in service if needed
              instructor_name: null,
              service_name: null
            });
          } catch (commissionError) {
            logger.warn('Failed to record manager commission after booking completion', {
              bookingId,
              error: commissionError.message
            });
          }

          try {
            await bookingNotificationService.sendLessonCompleted({ bookingId });
          } catch (notificationError) {
            logger.warn('Failed to send lesson completion notification after booking update', {
              bookingId,
              error: notificationError?.message || notificationError
            });
          }
        });
      }
    }
    
    // Send check-in notification to student when checkin_status changes to 'checked-in'
    const previousCheckinStatus = (currentBooking.checkin_status || '').toLowerCase();
    const nextCheckinStatus = (updatedBooking.checkin_status || '').toLowerCase();
    if (nextCheckinStatus === 'checked-in' && previousCheckinStatus !== 'checked-in') {
      setImmediate(async () => {
        try {
          await bookingNotificationService.sendLessonCheckedIn({ bookingId: updatedBooking.id });
        } catch (notificationError) {
          logger.warn('Failed to send lesson check-in notification after booking update', {
            bookingId: updatedBooking.id,
            error: notificationError?.message || notificationError
          });
        }
      });
    }

    // Emit real-time event for booking update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', updatedBooking);
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
      } catch (socketError) {
        logger.warn('Failed to emit socket event', socketError);
      }
    }

  // Send immediate response to client for fast UI feedback
  res.status(200).json(updatedBooking);

    // **📅 RESCHEDULE DETECTION: Notify student if date, time, or instructor changed**
    setImmediate(async () => {
      try {
        const dateChanged = currentBooking.date && date &&
          String(currentBooking.date).slice(0, 10) !== String(date).slice(0, 10);
        const timeChanged = currentBooking.start_hour !== null && start_hour !== undefined && 
          Number(currentBooking.start_hour) !== Number(start_hour);
        const instructorChanged = instructor_user_id && 
          currentBooking.instructor_user_id !== instructor_user_id;

        if (dateChanged || timeChanged || instructorChanged) {
          const studentId = updatedBooking.student_user_id || updatedBooking.customer_user_id;
          if (studentId) {
            // Fetch names for context
            const [studentRes, serviceRes, oldInstrRes, newInstrRes] = await Promise.all([
              pool.query('SELECT name, email FROM users WHERE id = $1', [studentId]),
              updatedBooking.service_id
                ? pool.query('SELECT name FROM services WHERE id = $1', [updatedBooking.service_id])
                : Promise.resolve({ rows: [] }),
              currentBooking.instructor_user_id
                ? pool.query('SELECT name FROM users WHERE id = $1', [currentBooking.instructor_user_id])
                : Promise.resolve({ rows: [] }),
              instructor_user_id
                ? pool.query('SELECT name FROM users WHERE id = $1', [instructor_user_id])
                : Promise.resolve({ rows: [] })
            ]);

            const student = studentRes.rows[0];
            const serviceName = serviceRes.rows[0]?.name || 'Lesson';
            const oldInstructorName = oldInstrRes.rows[0]?.name || null;
            const newInstructorName = newInstrRes.rows[0]?.name || oldInstructorName;
            const changedBy = req.user?.id || null;

            // Build human-readable change description
            const changeParts = [];
            const oldDate = currentBooking.date ? new Date(currentBooking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
            const newDate = updatedBooking.date ? new Date(updatedBooking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
            if (dateChanged) changeParts.push(`date changed from ${oldDate} to ${newDate}`);
            if (timeChanged) {
              const fmtTime = (h) => { const hr = Math.floor(h); const min = Math.round((h - hr) * 60); return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`; };
              changeParts.push(`time changed from ${fmtTime(Number(currentBooking.start_hour))} to ${fmtTime(Number(updatedBooking.start_hour))}`);
            }
            if (instructorChanged) changeParts.push(`instructor changed from ${oldInstructorName || 'TBD'} to ${newInstructorName || 'TBD'}`);
            const changeMessage = `Your ${serviceName} has been rescheduled: ${changeParts.join(', ')}.`;

            // 1) Insert into reschedule notifications table
            await pool.query(`
              INSERT INTO booking_reschedule_notifications (
                booking_id, student_user_id, changed_by,
                old_date, new_date, old_start_hour, new_start_hour,
                old_instructor_id, new_instructor_id,
                service_name, old_instructor_name, new_instructor_name,
                message, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
            `, [
              updatedBooking.id,
              studentId,
              changedBy,
              currentBooking.date ? new Date(currentBooking.date).toISOString().slice(0, 10) : null,
              updatedBooking.date ? new Date(updatedBooking.date).toISOString().slice(0, 10) : null,
              currentBooking.start_hour,
              updatedBooking.start_hour,
              currentBooking.instructor_user_id || null,
              updatedBooking.instructor_user_id || null,
              serviceName,
              oldInstructorName,
              newInstructorName,
              changeMessage
            ]);

            // 2) Create in-app notification for the student
            await dispatchNotification({
              userId: studentId,
              type: 'booking_rescheduled_by_admin',
              title: `${serviceName} rescheduled`,
              message: changeMessage,
              data: {
                bookingId: updatedBooking.id,
                dateChanged,
                timeChanged,
                instructorChanged,
                cta: {
                  label: 'View details',
                  href: `/student/schedule`
                }
              },
              idempotencyKey: `reschedule-by-admin:${updatedBooking.id}:${Date.now()}`
            });

            // 3) Send real-time socket event so the pop-up shows immediately if student is online
            if (req.socketService) {
              try {
                req.socketService.emitToChannel(`user:${studentId}`, 'booking:rescheduled', {
                  bookingId: updatedBooking.id,
                  message: changeMessage,
                  serviceName
                });
              } catch (e) {
                // non-blocking
              }
            }

            // 4) Send email notification to student
            if (student?.email) {
              const emailNewDate = updatedBooking.date ? new Date(updatedBooking.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
              const fmtTime = (h) => { if (h == null) return 'TBD'; const hr = Math.floor(Number(h)); const min = Math.round((Number(h) - hr) * 60); return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`; };

              try {
                const scheduleUrl = `${process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://app.plannivo.com'}/student/schedule`;
                const changeDetails = [
                  dateChanged ? { label: 'Date', value: `${oldDate} → ${newDate}` } : null,
                  timeChanged ? { label: 'Time', value: `${fmtTime(currentBooking.start_hour)} → ${fmtTime(updatedBooking.start_hour)}` } : null,
                  instructorChanged ? { label: 'Instructor', value: `${oldInstructorName || 'TBD'} → ${newInstructorName || 'TBD'}` } : null
                ].filter(Boolean);

                const brandedHtml = buildBrandedEmail({
                  preheader: `Your ${serviceName} has been rescheduled`,
                  eyebrow: 'Booking update',
                  title: 'Your lesson has been rescheduled',
                  greeting: `Hi ${student.name || 'there'},`,
                  bodyParagraphs: [
                    `Your <strong>${serviceName}</strong> has been updated. Here's what changed:`
                  ],
                  details: changeDetails,
                  ctaLabel: 'View my schedule',
                  ctaUrl: scheduleUrl,
                  includeRawLink: false,
                  fineprint: [
                    'Please log in to confirm you\'ve seen this change.',
                    'This is an automated message — please do not reply. For questions, contact us at info@plannivo.com.'
                  ]
                });

                await sendEmail({
                  to: student.email,
                  subject: `Your ${serviceName} has been rescheduled — UKC.`,
                  userId: studentId,
                  notificationType: 'booking_rescheduled',
                  html: brandedHtml,
                  text: `Hi ${student.name || 'there'}, your ${serviceName} has been rescheduled. ${changeParts.join('. ')}. Please log in to confirm.\n\n— UKC.`
                });

                // Mark email as sent — Postgres UPDATE doesn't support ORDER BY + LIMIT
                // directly, so target the most recent matching row via a subquery.
                try {
                  await pool.query(`
                    UPDATE booking_reschedule_notifications
                    SET email_sent = TRUE, email_sent_at = NOW()
                    WHERE id = (
                      SELECT id FROM booking_reschedule_notifications
                      WHERE booking_id = $1 AND student_user_id = $2 AND status = 'pending'
                      ORDER BY created_at DESC
                      LIMIT 1
                    )
                  `, [updatedBooking.id, studentId]);
                } catch (markErr) {
                  logger.warn('Email sent but reschedule tracking row not updated', {
                    bookingId: updatedBooking.id,
                    error: markErr.message
                  });
                }
              } catch (emailErr) {
                logger.warn('Failed to send reschedule email', { bookingId: updatedBooking.id, error: emailErr.message });
              }
            }

            logger.info('Booking reschedule notification sent to student', {
              bookingId: updatedBooking.id,
              studentId,
              dateChanged,
              timeChanged,
              instructorChanged
            });
          }

          // Notify the involved instructor(s).
          if (instructorChanged) {
            // Old instructor lost the lesson.
            if (currentBooking.instructor_user_id) {
              await bookingNotificationService.notifyInstructorUnassigned({
                bookingId: updatedBooking.id,
                oldInstructorUserId: currentBooking.instructor_user_id,
                newInstructorUserId: instructor_user_id
              }).catch((err) => logger.warn('notifyInstructorUnassigned error', { error: err?.message }));
            }
            // New instructor gained it.
            if (instructor_user_id) {
              await bookingNotificationService.notifyInstructorAssigned({
                bookingId: updatedBooking.id,
                instructorUserId: instructor_user_id,
                isReassignment: true
              }).catch((err) => logger.warn('notifyInstructorAssigned error', { error: err?.message }));
            }
          } else if ((dateChanged || timeChanged) && updatedBooking.instructor_user_id) {
            await bookingNotificationService.notifyInstructorRescheduled({
              bookingId: updatedBooking.id,
              instructorUserId: updatedBooking.instructor_user_id,
              oldDate: currentBooking.date ? String(currentBooking.date).slice(0, 10) : null,
              oldStartHour: currentBooking.start_hour != null ? Number(currentBooking.start_hour) : null,
              oldLocation: currentBooking.location ?? null,
              newDate: updatedBooking.date ? String(updatedBooking.date).slice(0, 10) : null,
              newStartHour: updatedBooking.start_hour != null ? Number(updatedBooking.start_hour) : null,
              newLocation: updatedBooking.location ?? null
            }).catch((err) => logger.warn('notifyInstructorRescheduled error', { error: err?.message }));
          }
        }
      } catch (rescheduleErr) {
        logger.warn('Failed to send reschedule notification (non-blocking)', {
          bookingId: updatedBooking?.id,
          error: rescheduleErr.message
        });
      }
    });

    // NOTE: the financial cascade (discount rebase, instructor earnings, manager
    // commission, customer wallet settlement, package recalc) now runs
    // SYNCHRONOUSLY inside the transaction above, before COMMIT — see
    // `cascadeBookingUpdate(..., { client, strict: true })`. It is intentionally
    // no longer a post-commit setImmediate so a price edit and its money
    // movements are atomic.

    // A pure reschedule (date change) doesn't alter amounts, so it never trips the
    // financial cascade above — but the manager commission's period attribution must
    // follow the lesson to its new date. Finance reports filter lesson revenue by
    // booking.date and manager commission by mc.source_date, so a cross-month reschedule
    // would otherwise strand the commission in the old month. Sync it post-commit.
    const oldDateStr = currentBooking?.date ? String(currentBooking.date).slice(0, 10) : null;
    const newDateStr = updatedBooking?.date ? String(updatedBooking.date).slice(0, 10) : null;
    if (newDateStr && oldDateStr !== newDateStr) {
      setImmediate(async () => {
        try {
          const { updateManagerCommissionSourceDate } = await import('../services/managerCommissionService.js');
          await updateManagerCommissionSourceDate(pool, { sourceType: 'booking', sourceId: booking.id, newDate: newDateStr });
        } catch (err) {
          logger.warn('Failed to sync manager commission source_date on reschedule', { error: err?.message });
        }
      });
    }

    // Note: transaction already committed above; do not commit again here

  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === 'package_insufficient_hours') {
      return res.status(400).json({
        error: 'Package insufficient hours',
        message: error.message,
      });
    }
    logger.error('Failed to update booking', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Atomic swap of two bookings within a single transaction
// POST /bookings/swap
router.post(
  '/swap',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        a_id,
        b_id,
        a,
        b,
        date: overrideDate,
      } = req.body || {};

      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }

      // Normalize inputs
      const aTarget = {
        instructor_user_id: a.instructor_user_id || a.instructorId,
        start_hour: a.start_hour != null ? parseFloat(a.start_hour) : a.start_hour,
      };
      const bTarget = {
        instructor_user_id: b.instructor_user_id || b.instructorId,
        start_hour: b.start_hour != null ? parseFloat(b.start_hour) : b.start_hour,
      };

      if (!aTarget.instructor_user_id || aTarget.start_hour == null || !bTarget.instructor_user_id || bTarget.start_hour == null) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings for update
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));

      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      // Ensure same date unless explicitly overridden
      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }

      // Validate equal durations to maintain schedule density
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      // Check for overlaps against other bookings (excluding the two being swapped)
      const overlapSql = `
        SELECT id FROM bookings
        WHERE date = $1::date
          AND instructor_user_id = $2::uuid
          AND status NOT IN ('cancelled', 'pending_payment')
          AND deleted_at IS NULL
          AND id <> ALL($5::uuid[])
          AND (
            (start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric)
          )
        LIMIT 1
      `;

      const excludeIds = [aRow.id, bRow.id];

      // Check B's new position first (free up A's target slot)
      const conflictB = await client.query(overlapSql.replace('SELECT id', 'SELECT id, start_hour, duration, instructor_user_id'), [
        date,
        bTarget.instructor_user_id,
        parseFloat(bTarget.start_hour),
        durB,
        excludeIds,
      ]);
      if (conflictB.rows.length > 0) {
        await client.query('ROLLBACK');
        const c = conflictB.rows[0];
        return res.status(409).json({
          error: 'Target slot for booking B conflicts with another booking',
          side: 'B',
          conflictWith: c?.id,
          conflictAt: { start_hour: c?.start_hour, duration: c?.duration, instructor_user_id: c?.instructor_user_id },
          target: { instructor_user_id: bTarget.instructor_user_id, start_hour: bTarget.start_hour, duration: durB, date }
        });
      }

      // Check A's new position
      const conflictA = await client.query(overlapSql.replace('SELECT id', 'SELECT id, start_hour, duration, instructor_user_id'), [
        date,
        aTarget.instructor_user_id,
        parseFloat(aTarget.start_hour),
        durA,
        excludeIds,
      ]);
      if (conflictA.rows.length > 0) {
        await client.query('ROLLBACK');
        const c = conflictA.rows[0];
        return res.status(409).json({
          error: 'Target slot for booking A conflicts with another booking',
          side: 'A',
          conflictWith: c?.id,
          conflictAt: { start_hour: c?.start_hour, duration: c?.duration, instructor_user_id: c?.instructor_user_id },
          target: { instructor_user_id: aTarget.instructor_user_id, start_hour: aTarget.start_hour, duration: durA, date }
        });
      }

      // Perform both updates in a single statement to avoid unique constraint conflicts
      const { rows: updatedRows } = await client.query(
        `WITH params AS (
           SELECT 
             $1::uuid AS a_id,
             $2::uuid AS b_id,
             $3::uuid AS a_instr,
             $4::numeric AS a_start,
             $5::uuid AS b_instr,
             $6::numeric AS b_start,
             $7::date  AS new_date
         )
         UPDATE bookings b
         SET 
           instructor_user_id = CASE WHEN b.id = p.a_id THEN p.a_instr ELSE p.b_instr END,
           start_hour = CASE WHEN b.id = p.a_id THEN p.a_start ELSE p.b_start END,
           date = p.new_date,
           updated_at = NOW()
         FROM params p
         WHERE b.id IN (p.a_id, p.b_id)
         RETURNING b.*`,
        [
          aRow.id,
          bRow.id,
          aTarget.instructor_user_id,
          parseFloat(aTarget.start_hour),
          bTarget.instructor_user_id,
          parseFloat(bTarget.start_hour),
          date,
        ]
      );

      await client.query('COMMIT');

      // Map returned rows to A and B by id
      const updatedA = updatedRows.find(r => String(r.id) === String(aRow.id));
      const updatedB = updatedRows.find(r => String(r.id) === String(bRow.id));

      // Emit socket updates (best-effort, outside of tx)
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap):', socketError);
        }
      }

      return res.status(200).json({ a: updatedA, b: updatedB });
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error('Swap failed:', e);
      // Map common errors to clearer statuses when possible
      if (e && e.code === '23505') {
        // unique violation (if any constraint)
        return res.status(409).json({ error: 'Conflict during swap' });
      }
      return res.status(500).json({ error: 'Failed to swap bookings' });
    } finally {
      client.release();
    }
  }
);

// Parking-based swap fallback: move A to a temporary free slot, then B->A, A->B
router.post(
  '/swap-with-parking',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { a_id, b_id, a, b, date: overrideDate } = req.body || {};
      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }
      const aTarget = { instructor_user_id: a.instructor_user_id || a.instructorId, start_hour: parseFloat(a.start_hour) };
      const bTarget = { instructor_user_id: b.instructor_user_id || b.instructorId, start_hour: parseFloat(b.start_hour) };
      if (!aTarget.instructor_user_id || isNaN(aTarget.start_hour) || !bTarget.instructor_user_id || isNaN(bTarget.start_hour)) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));
      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      // Helper: check overlap for an instructor/time
      const overlapCheck = async (instrId, startHour, duration, excludeIds) => {
        const sql = `SELECT id FROM bookings
          WHERE date = $1::date
            AND instructor_user_id = $2::uuid
            AND status NOT IN ('cancelled', 'pending_payment')
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Batch: fetch ALL bookings for both instructors on this date in ONE query
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      const { rows: dayBookings } = await client.query(
        `SELECT instructor_user_id, start_hour::numeric AS sh, duration::numeric AS dur
         FROM bookings
         WHERE date = $1::date
           AND instructor_user_id = ANY($2::uuid[])
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           AND id <> ALL($3::uuid[])
        `,
        [date, tryInstructors, exclude]
      );
      // Build occupied-interval sets per instructor
      const busyMap = new Map();
      for (const b of dayBookings) {
        if (!busyMap.has(b.instructor_user_id)) busyMap.set(b.instructor_user_id, []);
        busyMap.get(b.instructor_user_id).push({ sh: parseFloat(b.sh), dur: parseFloat(b.dur) });
      }
      const overlaps = (instrId, startH, dur) => {
        const intervals = busyMap.get(instrId) || [];
        return intervals.some(iv => startH < iv.sh + iv.dur && startH + dur > iv.sh);
      };

      // Find a parking slot in pure JS (no more DB queries per slot)
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          if (!overlaps(instr, h, durA)) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
        }
      }
      if (!parking) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No temporary parking slot available to complete swap' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [parking.instructor_user_id, parking.start_hour, date, aRow.id]
      );

      // Step 2: B -> A's original
      const aOld = { instructor_user_id: aRow.instructor_user_id, start_hour: aRow.start_hour };
      if (await overlapCheck(aOld.instructor_user_id, aOld.start_hour, durB, exclude)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A original slot became occupied' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aOld.instructor_user_id, aOld.start_hour, date, bRow.id]
      );

      // Step 3: A (from parking) -> B's target
      if (await overlapCheck(aTarget.instructor_user_id, aTarget.start_hour, durA, exclude)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'B target slot is occupied' });
      }
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aTarget.instructor_user_id, aTarget.start_hour, date, aRow.id]
      );

      await client.query('COMMIT');

      // Fetch and return both updated rows
      const { rows: updated } = await client.query(`SELECT * FROM bookings WHERE id = ANY($1::uuid[])`, [[aRow.id, bRow.id]]);
      const updatedA = updated.find(r => String(r.id) === String(aRow.id));
      const updatedB = updated.find(r => String(r.id) === String(bRow.id));

      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap-with-parking):', socketError);
        }
      }

      return res.status(200).json({ a: updatedA, b: updatedB, parking_used: parking });
    } catch (e) {
      await client.query('ROLLBACK');
      try { logger?.error?.('Swap with parking failed:', e); } catch (_) {}
      return res.status(500).json({ error: 'Failed to swap with parking' });
    } finally {
      client.release();
    }
  }
);

// Unified swap: try direct atomic swap; on conflict, fallback to parking-based swap
router.post(
  '/swap-auto',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  rateLimitBookingUpdates,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { a_id, b_id, a, b, date: overrideDate } = req.body || {};
      if (!a_id || !b_id || !a || !b) {
        return res.status(400).json({ error: 'a_id, b_id, and targets a,b are required' });
      }
      const aTarget = { instructor_user_id: a.instructor_user_id || a.instructorId, start_hour: parseFloat(a.start_hour) };
      const bTarget = { instructor_user_id: b.instructor_user_id || b.instructorId, start_hour: parseFloat(b.start_hour) };
      if (!aTarget.instructor_user_id || isNaN(aTarget.start_hour) || !bTarget.instructor_user_id || isNaN(bTarget.start_hour)) {
        return res.status(400).json({ error: 'Both targets must include instructor_user_id and start_hour' });
      }

      await client.query('BEGIN');

      // Lock both bookings
      const { rows: lockRows } = await client.query(
        `SELECT * FROM bookings WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [[a_id, b_id]]
      );
      if (!lockRows || lockRows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found' });
      }
      const aRow = lockRows.find(r => String(r.id) === String(a_id));
      const bRow = lockRows.find(r => String(r.id) === String(b_id));
      if (!aRow || !bRow || aRow.deleted_at || bRow.deleted_at) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One or both bookings not found or deleted' });
      }

      const date = overrideDate || aRow.date;
      if (!overrideDate && String(aRow.date) !== String(bRow.date)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap requires same date unless `date` override is provided' });
      }
      const durA = parseFloat(aRow.duration) || 1;
      const durB = parseFloat(bRow.duration) || 1;
      if (Math.abs(durA - durB) > 0.001) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Swap not allowed: different durations' });
      }

      const overlapCheck = async (instrId, startHour, duration, excludeIds) => {
        const sql = `SELECT id FROM bookings
          WHERE date = $1::date
            AND instructor_user_id = $2::uuid
            AND status NOT IN ('cancelled', 'pending_payment')
            AND deleted_at IS NULL
            AND id <> ALL($5::uuid[])
            AND ((start_hour < ($3::numeric + $4::numeric)) AND ((start_hour + duration) > $3::numeric))
          LIMIT 1`;
        const r = await client.query(sql, [date, instrId, parseFloat(startHour), parseFloat(duration), excludeIds]);
        return r.rows.length > 0;
      };

      const exclude = [aRow.id, bRow.id];
      // Batch: fetch ALL bookings for both instructors on this date in ONE query
      const tryInstructors = [aRow.instructor_user_id, bRow.instructor_user_id];
      const { rows: dayBookings } = await client.query(
        `SELECT instructor_user_id, start_hour::numeric AS sh, duration::numeric AS dur
         FROM bookings
         WHERE date = $1::date
           AND instructor_user_id = ANY($2::uuid[])
           AND status NOT IN ('cancelled', 'pending_payment')
           AND deleted_at IS NULL
           AND id <> ALL($3::uuid[])
        `,
        [date, tryInstructors, exclude]
      );
      const busyMap = new Map();
      for (const b of dayBookings) {
        if (!busyMap.has(b.instructor_user_id)) busyMap.set(b.instructor_user_id, []);
        busyMap.get(b.instructor_user_id).push({ sh: parseFloat(b.sh), dur: parseFloat(b.dur) });
      }
      const overlaps = (instrId, startH, dur) => {
        const intervals = busyMap.get(instrId) || [];
        return intervals.some(iv => startH < iv.sh + iv.dur && startH + dur > iv.sh);
      };

      // Find parking slot in pure JS (no more per-slot DB queries)
      let parking = null;
      outer: for (const instr of tryInstructors) {
        for (let h = 6; h <= 21 - durA + 0.0001; h += 0.5) {
          if (!overlaps(instr, h, durA)) { parking = { instructor_user_id: instr, start_hour: h }; break outer; }
        }
      }
      if (!parking) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No temporary parking slot available to complete swap' });
      }

      // Step 1: A -> parking
      try {
        await client.query(
          `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
          [parking.instructor_user_id, parking.start_hour, date, aRow.id]
        );
      } catch (e) {
        if (e?.code === '23505') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Parking slot became unavailable' });
        }
        throw e;
      }

      // Step 2: B -> A original
      const aOld = { instructor_user_id: aRow.instructor_user_id, start_hour: aRow.start_hour };
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aOld.instructor_user_id, aOld.start_hour, date, bRow.id]
      );

      // Step 3: A -> target
      await client.query(
        `UPDATE bookings SET instructor_user_id=$1::uuid, start_hour=$2::numeric, date=$3::date, updated_at=NOW() WHERE id=$4::uuid`,
        [aTarget.instructor_user_id, aTarget.start_hour, date, aRow.id]
      );

  await client.query('COMMIT');
      const { rows: updated2 } = await client.query(`SELECT * FROM bookings WHERE id = ANY($1::uuid[])`, [[aRow.id, bRow.id]]);
      const updatedA2 = updated2.find(r => String(r.id) === String(aRow.id));
      const updatedB2 = updated2.find(r => String(r.id) === String(bRow.id));
      if (req.socketService) {
        try {
          req.socketService.emitToChannel('general', 'booking:updated', updatedA2);
          req.socketService.emitToChannel('general', 'booking:updated', updatedB2);
          req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'updated' });
        } catch (socketError) {
          logger?.warn?.('Failed to emit socket event (swap-auto parking):', socketError);
        }
      }
      return res.status(200).json({ a: updatedA2, b: updatedB2, mode: 'parking' });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      try { logger?.error?.('swap-auto failed:', e); } catch (_) {}
      if (e?.code === '23505') {
        return res.status(409).json({ error: 'Conflict detected during swap' });
      }
      return res.status(500).json({ error: 'Failed to swap (auto)' });
    } finally {
      client.release();
    }
  }
);

// Import the SoftDeleteService
import SoftDeleteService from '../services/softDeleteService.js';
import { undoManager } from '../services/undoManager.js';

/**
 * @route DELETE /api/bookings/:id
 * @desc Delete a booking with package hour restoration and balance refunds
 * @access Private (Admin/Manager)
 */
// Internal helper to delete a single booking inside a provided client/tx and capture reconciliation
async function deleteOneBookingWithinTx(client, bookingId, deletingUserId, reason) {
  // Returns { result, packagesUpdated, totalHoursRestored, balanceRefunded, refundType, bookingSnapshot }
  // Based on the main delete route body below; adapted to run within existing tx
  // Get complete booking details before deletion
  const bookingResult = await client.query(
    `SELECT b.*, s.name as service_name, s.price as service_price
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [bookingId]
  );
  if (bookingResult.rows.length === 0) {
    return { error: 'not_found' };
  }
  const booking = bookingResult.rows[0];
  const studentId = booking.student_user_id;
  const duration = parseFloat(booking.duration) || 0;
  const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;

  // Restore the EXACT recorded package hours (partial-aware, per-participant).
  const packagesUpdated = duration > 0 ? await restoreBookingPackageHours(client, booking) : [];
  let totalHoursRestored = packagesUpdated.reduce((s, p) => s + (parseFloat(p.hoursRestored) || 0), 0);

  // Refund each payer their OWN outstanding wallet charge (per-user, net of any
  // prior refund, idempotent). No wallet charge => no refund (no phantom credit
  // for cash/gateway). Package hours already restored above don't double as cash.
  let balanceRefunded = 0;
  let refundType = totalHoursRestored > 0 ? 'package_hours_restored' : 'none';
  if (studentId) {
    try {
      balanceRefunded = await refundBookingNetChargesPerUser(client, booking, {
        transactionType: 'booking_deleted_refund',
        reason: 'booking_deleted',
        actorId: deletingUserId,
      });
      if (balanceRefunded > 0) {
        refundType = totalHoursRestored > 0 ? 'package_hours_and_cash_refunded' : 'balance_refund';
      }
    } catch (walletError) {
      logger?.error?.('Failed to record wallet refund for booking helper delete', {
        bookingId, studentId, error: walletError?.message,
      });
      throw walletError;
    }
  }

  if (balanceRefunded > 0 || totalHoursRestored > 0) {
    logger.info('Ledger transaction recorded for helper booking deletion; legacy transactions table insert skipped.');
  }

  if (studentId) {
    await client.query(
      `INSERT INTO financial_events (user_id, event_type, entity_type, entity_id, amount, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        studentId,
        'booking_deleted',
        'booking',
        bookingId,
        bookingAmount,
        JSON.stringify({
          deleted_booking: booking,
          packages_updated: packagesUpdated,
          balance_refunded: balanceRefunded,
          total_hours_restored: totalHoursRestored,
          refund_type: refundType,
          deleted_by: deletingUserId,
          deletion_reason: reason
        })
      ]
    );
  }

  // Drop the (unpaid) instructor_earnings snapshot for the deleted booking.
  await clearInstructorEarningsForBooking(client, bookingId);

  await client.query(
    `UPDATE bookings SET deleted_at = NOW(), deleted_by = $1, deletion_reason = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL`,
    [deletingUserId, reason, bookingId]
  );

  // Cancel the manager commission in the SAME transaction — the single-delete
  // route has done this (M2) but this bulk helper never did, which is how
  // bulk-deleted lessons left 'pending' commissions on soft-deleted sources.
  await client.query(
    `UPDATE manager_commissions
        SET status = 'cancelled',
            notes = COALESCE(notes || ' | ', '') || $1,
            updated_at = NOW()
      WHERE source_type = 'booking' AND source_id = $2 AND status = 'pending'`,
    ['Cancelled: Booking deleted (bulk)', String(bookingId)]
  );

  return {
    result: { success: true, id: bookingId },
    packagesUpdated,
    totalHoursRestored,
    balanceRefunded,
    refundType,
    bookingSnapshot: booking,
  };
}

// eslint-disable-next-line complexity
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'receptionist', 'front_desk']), async (req, res) => {
    const bookingId = req.params.id;
    const deletingUserId = req.user.id;
    const reason = (req.body && req.body.reason) || 'Administrative deletion';
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get complete booking details before deletion
        const bookingResult = await client.query(`
            SELECT b.*, s.name as service_name, s.price as service_price
            FROM bookings b
            LEFT JOIN services s ON b.service_id = s.id
            WHERE b.id = $1 AND b.deleted_at IS NULL
        `, [bookingId]);
        
        if (bookingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                error: true, 
                message: 'Booking not found or already deleted' 
            });
        }
        
        const booking = bookingResult.rows[0];
        const studentId = booking.student_user_id;
        const duration = parseFloat(booking.duration) || 0;
        const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
        
        // 1. RESTORE PACKAGE HOURS (participant- and partial-aware; exact recorded hours)
        const packagesUpdated = duration > 0 ? await restoreBookingPackageHours(client, booking) : [];
        let totalHoursRestored = packagesUpdated.reduce((s, p) => s + (parseFloat(p.hoursRestored) || 0), 0);

        // 2. REFUND each payer their OWN outstanding wallet charge (per-user, net of
        //    prior refunds, idempotent). No wallet charge => no refund, so cash/gateway
        //    bookings and pure-package bookings never get a phantom credit, and a group
        //    refunds every participant the share they actually paid (not a lump to the primary).
        let balanceRefunded = 0;
        let refundType = totalHoursRestored > 0 ? 'package_hours_restored' : 'none';
        if (studentId) {
            try {
                balanceRefunded = await refundBookingNetChargesPerUser(client, booking, {
                  transactionType: 'booking_deleted_refund',
                  reason: 'booking_deleted',
                  actorId: deletingUserId,
                });
                if (balanceRefunded > 0) {
                  refundType = totalHoursRestored > 0 ? 'package_hours_and_cash_refunded' : 'balance_refund';
                }
            } catch (walletError) {
                logger.error('Failed to record wallet refund for booking deletion', {
                  bookingId, studentId, error: walletError?.message,
                });
                throw walletError;
            }
        }
        
        // 3. CREATE FINANCIAL TRANSACTION RECORD
    if (balanceRefunded > 0 || totalHoursRestored > 0) {
      logger.info('Ledger transaction recorded for booking deletion; legacy transactions table insert skipped.');
    }
        
        // 4. CREATE FINANCIAL EVENT FOR AUDIT TRAIL
        if (studentId) {
            await client.query(`
                INSERT INTO financial_events (
                    user_id,
                    event_type,
                    entity_type,
                    entity_id,
                    amount,
                    metadata,
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                studentId,
                'booking_deleted',
                'booking',
                bookingId,
                bookingAmount,
                JSON.stringify({
                    deleted_booking: booking,
                    packages_updated: packagesUpdated,
                    balance_refunded: balanceRefunded,
                    total_hours_restored: totalHoursRestored,
                    refund_type: refundType,
                    deleted_by: deletingUserId,
                    deletion_reason: reason
                })
            ]);
            
            logger.info('Created financial event for audit trail');
        }
        
    // 4b. Drop the (unpaid) instructor_earnings snapshot for the deleted booking
    //     so it stops counting as instructor cost in snapshot-based aggregates.
    await clearInstructorEarningsForBooking(client, bookingId);

    // 5. SOFT DELETE THE BOOKING
    const _deleteResult = await client.query(`
      UPDATE bookings
      SET deleted_at = NOW(),
        deleted_by = $1,
        deletion_reason = $2,
        updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [deletingUserId, reason, bookingId]);

    // M2: cancel the manager commission for this booking in the SAME transaction
    // so a deleted lesson never lingers as pending income. Read-side guards also
    // exclude it, but an explicit 'cancelled' status keeps any un-guarded reader
    // honest and matches what the cancel-booking route already does. Paid-out
    // rows (payout_id set) keep status != 'pending' and are left untouched.
    await client.query(`
      UPDATE manager_commissions
         SET status = 'cancelled',
             notes = COALESCE(notes || ' | ', '') || $1,
             updated_at = NOW()
       WHERE source_type = 'booking' AND source_id = $2 AND status = 'pending'
    `, ['Cancelled: Booking deleted', String(bookingId)]);

  logger.info('Booking marked as deleted');
        
        await client.query('COMMIT');
  logger.info('Delete booking transaction committed');
        
        // Emit real-time events
        if (req.socketService) {
            try {
                req.socketService.emitToChannel('general', 'booking:deleted', { 
                    id: bookingId,
                    packagesUpdated: packagesUpdated.length,
                    balanceRefunded
                });
                req.socketService.emitToChannel('general', 'dashboard:refresh', { 
                    type: 'booking', 
                    action: 'deleted',
                    userId: studentId
                });
        logger.info('Socket events emitted');
      } catch (socketError) {
        logger.warn('Failed to emit socket event:', socketError);
            }
        }
        
        // Prepare success response
        const response = {
            success: true,
            message: 'Booking deleted successfully',
            id: bookingId,
            deletedAt: new Date().toISOString(),
            packagesUpdated,
            totalHoursRestored,
            balanceRefunded,
            refundType
        };
        
        // Add specific success messages
        if (totalHoursRestored > 0 && balanceRefunded > 0) {
            response.message += `. ${totalHoursRestored} hours restored to packages and €${balanceRefunded} refunded to balance.`;
        } else if (totalHoursRestored > 0) {
            response.message += `. ${totalHoursRestored} hours restored to packages.`;
        } else if (balanceRefunded > 0) {
            response.message += `. €${balanceRefunded} refunded to balance.`;
        }
        
  logger.info('Sending delete success response');
        res.json(response);

        // Notify instructor about the deletion (in-app + Telegram).
        if (booking.instructor_user_id) {
          bookingNotificationService.notifyInstructorCancelled({
            bookingId,
            instructorUserId: booking.instructor_user_id,
            reason: reason || 'Booking deleted'
          }).catch((err) => logger.warn('notifyInstructorCancelled (delete) error', { error: err?.message }));
        }
    } catch (error) {
        await client.query('ROLLBACK');
  logger.error('Error deleting booking:', error);
  logger.error('Error stack:', error.stack);
        
        if (error.message === 'Booking not found or already deleted') {
            return res.status(404).json({
                error: true,
                message: 'Booking not found or already deleted'
            });
        }
        
        res.status(500).json({
            error: true,
            message: 'Failed to delete booking'
        });
    } finally {
        client.release();
    }
});

/**
 * @route POST /api/bookings/bulk-delete
 * @desc Bulk delete bookings with auto reconciliation and 10s undo token
 * @access Private (Admin/Manager)
 */
router.post('/bulk-delete', authenticateJWT, authorizeRoles(['admin', 'manager', 'receptionist', 'front_desk']), async (req, res) => {
  const { ids = [], reason = 'Bulk deletion' } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: true, message: 'ids[] is required' });
  }
  const deletingUserId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const perItem = [];
    for (const id of ids) {
      const r = await deleteOneBookingWithinTx(client, id, deletingUserId, reason);
      perItem.push({ id, ...r });
    }
    await client.query('COMMIT');

    // Create an undo token with the list and minimal reconciliation data
    const { token, expiresAt } = undoManager.createToken({
      type: 'bookings.bulk-delete',
      items: perItem.map(x => ({
        id: x.id,
        booking: x.bookingSnapshot,
        refundType: x.refundType,
        balanceRefunded: x.balanceRefunded,
        totalHoursRestored: x.totalHoursRestored,
        packagesUpdated: x.packagesUpdated,
      })),
      reason,
      deletedBy: deletingUserId,
    });

    res.json({
      success: true,
      deleted: perItem.filter(x => !x.error).map(x => x.id),
      failed: perItem.filter(x => x.error).map(x => ({ id: x.id, error: x.error })),
      undoToken: token,
      undoExpiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (e) {
    await client.query('ROLLBACK');
  logger.error('Bulk delete failed:', e);
    res.status(500).json({ error: true, message: 'Bulk delete failed' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/undo-delete
 * @desc Undo a recent bulk delete using token (10s window)
 * @access Private (Admin/Manager)
 */
router.post('/undo-delete', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: true, message: 'token is required' });
  const data = undoManager.redeem(token);
  if (!data || data.type !== 'bookings.bulk-delete') {
    return res.status(410).json({ error: true, message: 'Undo window expired or token invalid' });
  }
  const actorId = resolveActorId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const restoredIds = [];
    for (const item of data.items) {
      // Only restore if booking still exists and is soft-deleted
      const { rows } = await client.query(`SELECT id, deleted_at FROM bookings WHERE id = $1`, [item.id]);
      if (rows.length && rows[0].deleted_at) {
        // Restore the ORIGINAL status from the undo snapshot — hardcoding
        // 'confirmed' demoted completed lessons, so the later cascade never
        // recreated their earnings (needsEarningsCreation only fires on a
        // transition INTO completed).
        const originalStatus =
          item.booking?.status && item.booking.status !== 'deleted'
            ? item.booking.status
            : 'confirmed';
        await client.query(`
          UPDATE bookings
          SET deleted_at = NULL,
              deleted_by = NULL,
              deletion_reason = NULL,
              status = $2,
              updated_at = NOW()
          WHERE id = $1
        `, [item.id, originalStatus]);

        // Reverse balance refund if any
        if (item.balanceRefunded && item.booking?.student_user_id) {
          try {
            await recordLegacyTransaction({
              userId: item.booking.student_user_id,
              amount: -Math.abs(item.balanceRefunded),
              transactionType: 'booking_delete_undo_adjustment',
              status: 'completed',
              direction: 'debit',
              description: 'Undo bulk deletion - reverse refund',
              metadata: {
                bookingId: item.id,
                action: 'undo_delete_reversal'
              },
              entityType: 'booking',
              relatedEntityType: 'booking',
              relatedEntityId: item.id,
              bookingId: item.id,
              createdBy: actorId,
              allowNegative: true,
              client
            });
          } catch (walletError) {
            logger.error('Failed to reverse wallet refund during undo-delete', {
              bookingId: item.id,
              studentId: item.booking.student_user_id,
              amount: item.balanceRefunded,
              error: walletError?.message
            });
            throw walletError;
          }
        }

        // Re-deduct the EXACT recorded package hours (partial-aware, per-participant)
        // and re-activate the manager commission the delete had cancelled.
        if (item.booking) {
          await reconsumeBookingPackageHours(client, item.booking);
        }
        await reactivateManagerCommissionForBooking(client, item.id);
        await reseedEarningsForRestoredBooking(client, item.id);

        restoredIds.push(item.id);
      }
    }
    await client.query('COMMIT');
    return res.json({ success: true, restored: restoredIds });
  } catch (e) {
    await client.query('ROLLBACK');
  logger.error('Undo failed:', e);
    res.status(500).json({ error: true, message: 'Undo failed' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/restore-latest
 * @desc Restore the most recently soft-deleted booking and reverse reconciliation
 * @access Private (Admin/Manager)
 */
router.post('/restore-latest', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'No soft-deleted bookings found' });
    }
    const booking = rows[0];

    // Restore booking flags
    await client.query(
      `UPDATE bookings
       SET deleted_at = NULL,
           deleted_by = NULL,
           deletion_reason = NULL,
           status = COALESCE(NULLIF(status, 'deleted'), 'confirmed'),
           updated_at = NOW()
       WHERE id = $1`,
      [booking.id]
    );

    // Reverse user balance refund if non-package
    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    if (bookingAmount > 0 && booking.student_user_id && !(booking.payment_status === 'package' || booking.customer_package_id)) {
      try {
        await recordLegacyTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(bookingAmount),
          transactionType: 'booking_restore_adjustment',
          status: 'completed',
          direction: 'debit',
          description: 'Restore latest soft-delete - reverse refund',
          metadata: {
            bookingId: booking.id,
            action: 'restore_latest_reversal'
          },
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          createdBy: actorId,
          allowNegative: true,
          client
        });
      } catch (walletError) {
        logger.error('Failed to reverse wallet refund during restore-latest', {
          bookingId: booking.id,
          studentId: booking.student_user_id,
          amount: bookingAmount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    // Re-deduct the EXACT recorded package hours (partial-aware), re-activate
    // the manager commission the delete had cancelled, and re-seed the
    // instructor earnings snapshot the delete removed.
    await reconsumeBookingPackageHours(client, booking);
    await reactivateManagerCommissionForBooking(client, booking.id);
    await reseedEarningsForRestoredBooking(client, booking.id);

    await client.query('COMMIT');
    return res.json({ success: true, restoredId: booking.id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('restore-latest failed:', e);
    return res.status(500).json({ error: true, message: 'Failed to restore latest booking' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/:id/restore
 * @desc Restore a specific soft-deleted booking and reverse reconciliation
 * @access Private (Admin/Manager)
 */
router.post('/:id/restore', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Booking not found or not deleted' });
    }
    const booking = rows[0];

    await client.query(
      `UPDATE bookings
       SET deleted_at = NULL,
           deleted_by = NULL,
           deletion_reason = NULL,
           status = COALESCE(NULLIF(status, 'deleted'), 'confirmed'),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    if (bookingAmount > 0 && booking.student_user_id && !(booking.payment_status === 'package' || booking.customer_package_id)) {
      try {
        await recordLegacyTransaction({
          userId: booking.student_user_id,
          amount: -Math.abs(bookingAmount),
          transactionType: 'booking_restore_adjustment',
          status: 'completed',
          direction: 'debit',
          description: 'Restore soft-delete - reverse refund',
          metadata: {
            bookingId: booking.id,
            action: 'restore_specific_reversal'
          },
          entityType: 'booking',
          relatedEntityType: 'booking',
          relatedEntityId: booking.id,
          bookingId: booking.id,
          createdBy: actorId,
          allowNegative: true,
          client
        });
      } catch (walletError) {
        logger.error('Failed to reverse wallet refund during restore booking', {
          bookingId: booking.id,
          studentId: booking.student_user_id,
          amount: bookingAmount,
          error: walletError?.message
        });
        throw walletError;
      }
    }

    // Re-deduct the EXACT recorded package hours (partial-aware), re-activate
    // the manager commission the delete had cancelled, and re-seed the
    // instructor earnings snapshot the delete removed.
    await reconsumeBookingPackageHours(client, booking);
    await reactivateManagerCommissionForBooking(client, booking.id);
    await reseedEarningsForRestoredBooking(client, booking.id);

    await client.query('COMMIT');
    return res.json({ success: true, restoredId: id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('restore by id failed:', e);
    return res.status(500).json({ error: true, message: 'Failed to restore booking' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/bookings/:id/restore
 * @desc Restore a soft deleted booking
 * @access Private (Admin only)
 * TEMPORARILY DISABLED - SoftDeleteService import issue
 */
/*
router.post('/:id/restore', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
    const bookingId = req.params.id;
    const restoringUserId = req.user.id;
    
    try {
        const result = await SoftDeleteService.restoreBooking(bookingId, restoringUserId);
        
        if (result.success) {
            // Emit real-time event for booking restoration
            if (req.socketService) {
                try {
                    req.socketService.emitToChannel('general', 'booking:restored', { id: bookingId });
                    req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'restored' });
                } catch (socketError) {
                    logger.warn('Failed to emit socket event', socketError);
                }
            }
            
            res.json({
                success: true,
                message: 'Booking restored successfully',
                data: result.data
            });
        } else {
            res.status(404).json({
                error: true,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Failed to restore booking', error);
        res.status(500).json({
            error: true,
            message: 'Failed to restore booking'
        });
    }
});
*/

/**
 * @route GET /api/bookings/deleted/list
 * @desc Get list of deleted bookings
 * @access Private (Admin only)
 */
router.get('/deleted/list', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
    try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';

    // Build filters
    const whereClauses = ['b.deleted_at IS NOT NULL'];
    const params = [];
    let idx = 1;

    if (q) {
      whereClauses.push(`((u.first_name || ' ' || u.last_name) ILIKE $${idx} OR (i.first_name || ' ' || i.last_name) ILIKE $${idx} OR s.name ILIKE $${idx} OR COALESCE(b.deletion_reason,'') ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx += 1;
    }
    if (dateFrom) {
      whereClauses.push(`b.date >= $${idx}`);
      params.push(dateFrom);
      idx += 1;
    }
    if (dateTo) {
      whereClauses.push(`b.date <= $${idx}`);
      params.push(dateTo);
      idx += 1;
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const listSql = `
      SELECT 
        b.*,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        i.first_name AS instructor_first_name,
        i.last_name AS instructor_last_name,
        s.name AS service_name,
        deleted_user.first_name AS deleted_by_first_name,
        deleted_user.last_name AS deleted_by_last_name
      FROM bookings b
      LEFT JOIN users u ON b.student_user_id = u.id
      LEFT JOIN users i ON b.instructor_user_id = i.id
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users deleted_user ON b.deleted_by = deleted_user.id
      ${whereSql}
      ORDER BY b.deleted_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const listParams = [...params, limit, offset];
    const { rows: deletedBookings } = await pool.query(listSql, listParams);

    const countSql = `
      SELECT COUNT(*) as total
      FROM bookings b
      LEFT JOIN users u ON b.student_user_id = u.id
      LEFT JOIN users i ON b.instructor_user_id = i.id
      LEFT JOIN services s ON b.service_id = s.id
      ${whereSql}
    `;
    const { rows: totalRows } = await pool.query(countSql, params);
        
        res.json({
            data: deletedBookings,
            pagination: {
                page,
                limit,
                total: parseInt(totalRows[0].total),
                totalPages: Math.ceil(totalRows[0].total / limit)
            }
        });
    } catch (error) {
  logger.error('Error fetching deleted bookings:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to fetch deleted bookings'
        });
    }
});

/**
 * @route POST /api/bookings/:id/cancel
 * @desc Cancel a booking (soft delete - keeps record but marks as cancelled)
 * @access Private
 */
// eslint-disable-next-line complexity
router.post('/:id/cancel', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { cancellation_reason = 'Admin cancellation' } = req.body;
  const _userId = req.user.id;
    const actorId = resolveActorId(req);
    
    await client.query('BEGIN');
    
  logger.info(`Cancelling booking ${id}...`);
    
    // Get booking details first
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    
    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
  const _studentId = booking.student_user_id;
    const duration = parseFloat(booking.duration) || 0;
    
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }
    
    // Restore the EXACT recorded package hours (participant- and partial-aware).
    // Previously this loop filtered payment_status === 'package' (skipping partial
    // participants) and the fallback restored the full booking `duration` instead
    // of the hours actually drawn.
    const packagesUpdated = duration > 0 ? await restoreBookingPackageHours(client, booking) : [];
    
    // Mark booking as cancelled
    const cancelResult = await client.query(
      `UPDATE bookings 
       SET status = 'cancelled', 
           canceled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [id, cancellation_reason]
    );
    
  const _cancelledBooking = cancelResult.rows[0];
    
    // Create financial event record for audit trail
    const bookingAmount = parseFloat(booking.final_amount || booking.amount) || 0;
    const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + (parseFloat(pkg.hoursRestored) || 0), 0);
    let balanceRefunded = 0;
    let refundType = totalHoursRestored > 0 ? 'package_hours_restored' : 'none';

    // Refund each payer their OWN outstanding wallet charge (per-user, net of any
    // prior refund, idempotent, currency-correct). Replaces the old logic which
    // (a) guarded on the non-existent columns booking.package_id / payment_method
    // so package cancels still cash-refunded, (b) raw-mutated users.balance AND
    // posted a wallet credit (dual-ledger drift), and (c) refunded the full
    // final_amount instead of the actual charge. No wallet charge => no refund.
    if (booking.student_user_id) {
      try {
        balanceRefunded = await refundBookingNetChargesPerUser(client, booking, {
          transactionType: 'booking_cancelled_refund',
          reason: 'booking_cancelled',
          actorId,
        });
        if (balanceRefunded > 0) {
          refundType = totalHoursRestored > 0 ? 'package_hours_and_cash_refunded' : 'balance_refund';
        }
      } catch (walletError) {
        logger.error('Failed to record wallet refund for cancelled booking', {
          bookingId: booking.id, studentId: booking.student_user_id, error: walletError?.message,
        });
        throw walletError;
      }
    }

    // Drop the instructor_earnings snapshot so a cancelled lesson stops counting
    // as instructor cost in snapshot-based aggregates (manager commission is
    // cancelled separately below).
    await clearInstructorEarningsForBooking(client, booking.id);

    await client.query('COMMIT');

    // Fire-and-forget cancel manager commission
    try {
      const { cancelCommission } = await import('../services/managerCommissionService.js');
      cancelCommission('booking', booking.id, 'Booking cancelled').catch((err) => {
        logger.warn('Manager commission cancellation failed (non-blocking):', { bookingId: booking.id, error: err.message });
      });
    } catch (commissionErr) {
      logger.warn('Failed to import manager commission service:', { error: commissionErr.message });
    }
    
    // Prepare success response
    let successMessage = 'Booking cancelled successfully';
    if (packagesUpdated.length > 0 && balanceRefunded > 0) {
        const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
        successMessage += `. ${totalHoursRestored} hours restored to packages and €${balanceRefunded} refunded to balance.`;
    } else if (packagesUpdated.length > 0) {
        const totalHoursRestored = packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
        successMessage += `. ${totalHoursRestored} hours restored to packages.`;
    } else if (balanceRefunded > 0) {
        successMessage += `. €${balanceRefunded} refunded to balance.`;
    }
    
    res.status(200).json({
      message: successMessage,
      booking: cancelResult.rows[0],
      packagesUpdated,
      balanceRefunded,
      refundType
    });

    // Notify instructor about the cancellation (in-app + Telegram).
    if (booking.instructor_user_id) {
      bookingNotificationService.notifyInstructorCancelled({
        bookingId: booking.id,
        instructorUserId: booking.instructor_user_id,
        reason: cancellation_reason
      }).catch((err) => logger.warn('notifyInstructorCancelled (cancel) error', { error: err?.message }));
    }
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
  } finally {
    client.release();
  }
});

// Helper: create a rental record from an approved booking (if it's a rental service and no rental exists yet)
async function ensureRentalFromBooking(client, booking, actorUserId) {
  try {
    const svcCheck = await client.query(
      `SELECT id, name, category, service_type, duration, price, currency FROM services WHERE id = $1`,
      [booking.service_id]
    );
    const svc = svcCheck.rows[0];
    if (!svc) return;

    const isRental = (
      (svc.category || '').toLowerCase().includes('rental') ||
      (svc.service_type || '').toLowerCase().includes('rental') ||
      (svc.name || '').toLowerCase().includes('rental') ||
      (svc.name || '').toLowerCase().includes('equipment')
    );
    if (!isRental) return;

    const userId = booking.student_user_id || booking.customer_user_id;

    // Check if a rental already exists for this booking's user + service + date
    const existing = await client.query(
      `SELECT id FROM rentals WHERE user_id = $1 AND equipment_ids @> $2::jsonb AND rental_date = $3 LIMIT 1`,
      [userId, JSON.stringify([booking.service_id]), booking.date]
    );
    if (existing.rows.length > 0) return; // Already has a rental

    const serviceDurationHours = parseFloat(svc.duration) || parseFloat(booking.duration) || 1;
    const bookingDate = booking.date || new Date().toISOString().split('T')[0];
    const startHour = parseFloat(booking.start_hour) || 9;
    const startDate = new Date(`${bookingDate}T${String(Math.floor(startHour)).padStart(2, '0')}:${String(Math.round((startHour % 1) * 60)).padStart(2, '0')}:00`);
    const endDate = new Date(startDate.getTime() + serviceDurationHours * 60 * 60 * 1000);

    const equipmentIds = JSON.stringify([booking.service_id]);
    const equipmentDetails = JSON.stringify({
      [svc.id]: { id: svc.id, name: svc.name, category: svc.category, price: parseFloat(svc.price) || 0, currency: svc.currency }
    });
    const totalPrice = parseFloat(booking.final_amount || booking.amount) || 0;

    const rentalResult = await client.query(
      `INSERT INTO rentals (
        user_id, equipment_ids, rental_date, start_date, end_date,
        status, total_price, payment_status, equipment_details, notes,
        created_by, family_member_id, participant_type
      ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      RETURNING id`,
      [
        userId, equipmentIds, bookingDate,
        startDate.toISOString(), endDate.toISOString(),
        'active', totalPrice, booking.payment_status || 'paid',
        equipmentDetails, booking.notes || null, actorUserId,
        booking.family_member_id || null,
        booking.family_member_id ? 'family_member' : 'self'
      ]
    );

    if (rentalResult.rows.length > 0) {
      const rentalId = rentalResult.rows[0].id;
      await client.query(
        `INSERT INTO rental_equipment (rental_id, equipment_id, daily_rate, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [rentalId, svc.id, parseFloat(svc.price) || 0, actorUserId]
      );
      logger.info('Created rental record from approved booking', {
        bookingId: booking.id, rentalId, serviceId: svc.id, serviceName: svc.name
      });
    }
  } catch (rentalErr) {
    logger.warn('Failed to create rental record from approved booking', {
      bookingId: booking.id, error: rentalErr?.message
    });
  }
}

// PATCH /:id/status - Update booking status (for approve/decline actions from notifications)
router.patch('/:id/status', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor', 'owner']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'pending_partner'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await client.query('BEGIN');
    
    // Get current booking (deleted_at guard: completing a soft-deleted booking
    // would re-create the earnings/commission rows the delete flow removed)
    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];

    // Check if booking is already in a terminal/same state (no action needed)
    const terminalStatuses = ['completed', 'cancelled', 'no_show'];
    const alreadyInRequestedState = booking.status === status;
    if (terminalStatuses.includes(booking.status) || alreadyInRequestedState) {
      // If already confirmed, ensure rental record exists (idempotent)
      if (booking.status === 'confirmed' || status === 'confirmed') {
        await ensureRentalFromBooking(client, booking, req.user.id);
      }

      // Still update notifications to hide buttons, but don't change booking status
      await client.query(
        `UPDATE notifications
         SET data = jsonb_set(
           COALESCE(data, '{}'::jsonb),
           '{status}',
           '"processed"'::jsonb
         )
         WHERE (data->>'bookingId')::text = $1::text
         AND type IN ('booking_instructor', 'booking_student', 'new_booking_alert')`,
        [id]
      );
      
      await client.query('COMMIT');
      
      // Return success - the booking was already processed
      const friendlyStatus = booking.status === 'confirmed' ? 'approved' : booking.status;
      return res.json({ 
        success: true, 
        message: `This lesson has already been ${friendlyStatus}`,
        status: booking.status,
        alreadyProcessed: true
      });
    }
    
    // === Refund + hour restore when cancelling ===
    if (status === 'cancelled') {
      const duration = parseFloat(booking.duration) || 0;

      // 1) Restore the EXACT recorded package hours (participant- and partial-aware).
      if (duration > 0) {
        await restoreBookingPackageHours(client, booking);
      }

      // 2) Refund each payer their OWN outstanding wallet charge (per-user, net,
      //    idempotent). Replaces the raw users.balance write + full-final_amount
      //    refund + dead booking.package_id guard. No wallet charge => no refund.
      if (booking.student_user_id) {
        try {
          await refundBookingNetChargesPerUser(client, booking, {
            transactionType: 'booking_cancelled_refund',
            reason: 'booking_cancelled',
            actorId: req.user.id,
          });
        } catch (walletError) {
          logger.error('Failed to record wallet refund on status-cancel', {
            bookingId: booking.id, error: walletError?.message
          });
          throw walletError;
        }
      }

      // 3) Drop the (unpaid) instructor_earnings snapshot and cancel the manager
      //    commission so a declined lesson stops counting as either cost or income.
      await clearInstructorEarningsForBooking(client, booking.id);
      await client.query(
        `UPDATE manager_commissions
            SET status = 'cancelled',
                notes = COALESCE(notes || ' | ', '') || $1,
                updated_at = NOW()
          WHERE source_type = 'booking' AND source_id = $2 AND status = 'pending'`,
        ['Cancelled: Booking declined via status update', String(id)]
      );

      // Update canceled_at timestamp
      await client.query(
        `UPDATE bookings SET canceled_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    }

    // Update status
    await client.query(
      `UPDATE bookings 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2`,
      [status, id]
    );

    // === Create rental record when approving a rental booking ===
    if (status === 'confirmed') {
      await ensureRentalFromBooking(client, booking, req.user.id);
    }

    // Fetch service name once for notifications (shared by confirmed & cancelled paths)
    let notifServiceName = 'Lesson';
    let notifBookingDate = '';
    if ((status === 'confirmed' || status === 'cancelled') && booking.student_user_id) {
      try {
        const svcRes = await client.query('SELECT name FROM services WHERE id = $1', [booking.service_id]);
        notifServiceName = svcRes.rows[0]?.name || 'Lesson';
        notifBookingDate = booking.date ? new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      } catch { /* non-critical */ }
    }

    // === Notify student when booking is confirmed/approved ===
    if (status === 'confirmed' && booking.student_user_id) {
      try {

        await dispatchNotification({
          userId: booking.student_user_id,
          type: 'booking_confirmed',
          title: 'Booking Confirmed',
          message: `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been confirmed!`,
          data: {
            bookingId: booking.id,
            serviceId: booking.service_id,
            date: booking.date,
            link: '/student/bookings'
          },
          client
        });
      } catch (notifErr) {
        logger.warn('Failed to send booking confirmation notification to student', {
          bookingId: booking.id, studentId: booking.student_user_id, error: notifErr?.message
        });
      }
    }

    // === Notify student when booking is cancelled/declined ===
    if (status === 'cancelled' && booking.student_user_id) {
      try {
        await dispatchNotification({
          userId: booking.student_user_id,
          type: 'booking_declined',
          title: 'Booking Declined',
          message: `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been declined. Any charges have been refunded.`,
          data: {
            bookingId: booking.id,
            serviceId: booking.service_id,
            date: booking.date,
            link: '/student/bookings'
          },
          client
        });
      } catch (notifErr) {
        logger.warn('Failed to send booking decline notification to student', {
          bookingId: booking.id, studentId: booking.student_user_id, error: notifErr?.message
        });
      }
    }

    // === Notify instructor when booking is cancelled (in-app + Telegram) ===
    if (status === 'cancelled' && booking.instructor_user_id) {
      bookingNotificationService.notifyInstructorCancelled({
        bookingId: booking.id,
        instructorUserId: booking.instructor_user_id,
        reason: 'Booking declined'
      }).catch((err) => logger.warn('notifyInstructorCancelled (status patch) error', { error: err?.message }));
    }
    
    // Update notification status for this booking
    // Set data.status to 'processed' to hide action buttons
    // Include all notification types that have action buttons for bookings
    await client.query(
      `UPDATE notifications
       SET data = jsonb_set(
         COALESCE(data, '{}'::jsonb),
         '{status}',
         '"processed"'::jsonb
       )
       WHERE (data->>'bookingId')::text = $1::text
       AND type IN ('booking_instructor', 'booking_student', 'new_booking_alert')`,
      [id]
    );
    
    // Log audit trail (non-critical — use SAVEPOINT so a failure doesn't abort the transaction)
    try {
      await client.query('SAVEPOINT audit_log_sp');
      await client.query(
        `INSERT INTO audit_logs (event_type, action, entity_type, resource_type, resource_id, actor_user_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          'booking_status_change',
          'update_booking_status',
          'booking',
          'booking',
          id,
          req.user.id,
          JSON.stringify({ oldStatus: booking.status, newStatus: status })
        ]
      );
      await client.query('RELEASE SAVEPOINT audit_log_sp');
    } catch (auditErr) {
      await client.query('ROLLBACK TO SAVEPOINT audit_log_sp').catch(() => {});
      logger.warn('Non-critical: Failed to insert audit log for booking status change', {
        bookingId: id, error: auditErr?.message
      });
    }
    
    await client.query('COMMIT');

    // S2: when this status patch COMPLETES a lesson, seed the instructor_earnings
    // snapshot AND the manager commission — exactly like PUT /:id does. Without
    // this, completing via PATCH (a public, whitelisted-status endpoint) created
    // no earnings and no commission. Gated on a true transition into a completed
    // status so a redundant patch doesn't double-fire.
    {
      const prevStatus = String(booking.status || '').toLowerCase().trim();
      const nextStatus = String(status || '').toLowerCase().trim();
      if (COMPLETED_BOOKING_STATUSES.has(nextStatus) && !COMPLETED_BOOKING_STATUSES.has(prevStatus)) {
        const completedBooking = { ...booking, status };
        setImmediate(async () => {
          try {
            await BookingUpdateCascadeService.cascadeBookingUpdate(
              completedBooking,
              { status, _previous: { status: booking.status } }
            );
          } catch (cascadeError) {
            logger.warn('Failed to cascade earnings after status-patch completion', {
              bookingId: booking.id, error: cascadeError?.message
            });
          }
          try {
            const { recordBookingCommission } = await import('../services/managerCommissionService.js');
            await recordBookingCommission({ ...completedBooking, student_name: null, instructor_name: null, service_name: null });
          } catch (commissionError) {
            logger.warn('Failed to record manager commission after status-patch completion', {
              bookingId: booking.id, error: commissionError?.message
            });
          }
        });
      }
    }

    // Emit real-time notification to the student after commit
    if ((status === 'confirmed' || status === 'cancelled') && booking.student_user_id) {
      try {
        socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          notification: {
            user_id: booking.student_user_id,
            title: status === 'confirmed' ? 'Booking Confirmed' : 'Booking Declined',
            message: status === 'confirmed'
              ? `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been confirmed!`
              : `Your ${notifServiceName} booking${notifBookingDate ? ` on ${notifBookingDate}` : ''} has been declined.`,
            type: status === 'confirmed' ? 'booking_confirmed' : 'booking_declined',
            data: { bookingId: booking.id, serviceId: booking.service_id, date: booking.date, link: '/student/bookings' },
            created_at: new Date().toISOString()
          }
        });
      } catch (emitErr) {
        logger.warn('Failed to emit real-time notification', { error: emitErr?.message });
      }
    }

    res.json({ 
      success: true, 
      message: `Booking ${status === 'confirmed' ? 'approved' : status === 'cancelled' ? 'declined' : 'updated'}`,
      status
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating booking status:', { bookingId: id, error: error?.message, stack: error?.stack });
    res.status(500).json({ error: 'Failed to update booking status', bookingId: id });
  } finally {
    client.release();
  }
});

/**
 * POST /bookings/:id/confirm-partner
 * Partner confirms a pending_partner booking → status becomes 'confirmed'
 * The booking immediately appears on the calendar as confirmed.
 */
router.post('/:id/confirm-partner', authenticateJWT, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    // Verify this booking is pending_partner and the caller is a participant
    const result = await client.query(
      `SELECT b.id, b.status, b.student_user_id, b.date, b.start_hour, b.duration,
              s.name AS service_name,
              bp.user_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    await client.query(
      `UPDATE bookings SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Notify the organizer that the partner accepted
    const booking = result.rows[0];
    const partnerName = req.user?.name || req.user?.first_name || 'Your partner';
    try {
      await dispatchNotification({
        userId: booking.student_user_id,
        type: 'booking',
        title: 'Partner Accepted!',
        message: `${partnerName} accepted your ${booking.service_name || 'group'} lesson invite on ${booking.date}.`,
        data: { bookingId: id, action: 'partner_accepted' }
      });
    } catch (notifErr) {
      logger.warn('Failed to notify organizer about partner acceptance', { error: notifErr?.message });
    }

    // Emit real-time events
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', { id, status: 'confirmed' });
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          title: 'Partner Accepted!',
          message: `${partnerName} accepted your lesson invite.`,
          type: 'booking'
        });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'partner_confirmed' });
      } catch (emitErr) {
        logger.warn('Failed to emit partner confirmation event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Booking confirmed by partner', status: 'confirmed' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error confirming partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to confirm booking' });
  } finally {
    client.release();
  }
});

/**
 * POST /bookings/:id/decline-partner
 * Partner declines a pending_partner booking → status becomes 'cancelled'
 * Package hours are refunded to both participants.
 */
router.post('/:id/decline-partner', authenticateJWT, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const result = await client.query(
      `SELECT b.id, b.status, b.student_user_id, b.duration, b.date,
              s.name AS service_name,
              bp.user_id, bp.customer_package_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    const booking = result.rows[0];

    // Restore the EXACT recorded package hours (partial-aware) to every
    // participant. The old inline loop used `package_hours_used || duration`,
    // which over-restored the FULL booking duration to a participant that drew 0
    // package hours (e.g. a partial/cash payer) — inventing free hours.
    await restoreBookingPackageHours(client, booking);

    // Cancel the booking
    await client.query(
      `UPDATE bookings SET status = 'cancelled', canceled_at = NOW(), cancellation_reason = 'Partner declined', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Drop the (unpaid) instructor_earnings snapshot and cancel the manager
    // commission so a declined booking stops counting as cost or income.
    await clearInstructorEarningsForBooking(client, booking.id);
    await client.query(
      `UPDATE manager_commissions
          SET status = 'cancelled', updated_at = NOW()
        WHERE source_type = 'booking' AND source_id = $1 AND status = 'pending'`,
      [String(id)]
    );

    await client.query('COMMIT');

    // Notify the organizer (after commit — fire-and-forget)
    const partnerName = req.user?.name || req.user?.first_name || 'Your partner';
    try {
      await dispatchNotification({
        userId: booking.student_user_id,
        type: 'booking',
        title: 'Partner Declined',
        message: `${partnerName} declined your ${booking.service_name || 'group'} lesson invite on ${booking.date}. Package hours have been refunded.`,
        data: { bookingId: id, action: 'partner_declined' }
      });
    } catch (notifErr) {
      logger.warn('Failed to notify organizer about partner decline', { error: notifErr?.message });
    }

    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'booking:updated', { id, status: 'cancelled' });
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          title: 'Partner Declined',
          message: `${partnerName} declined your lesson invite. Hours refunded.`,
          type: 'booking'
        });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'booking', action: 'partner_declined' });
      } catch (emitErr) {
        logger.warn('Failed to emit partner decline event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Booking declined, hours refunded', status: 'cancelled' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error declining partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to decline booking' });
  } finally {
    client.release();
  }
});

/**
 * POST /bookings/:id/suggest-time
 * Partner suggests an alternative time for a pending_partner booking.
 * Sends a notification to the organizer with the suggested date/time.
 */
router.post('/:id/suggest-time', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { suggestedDate, suggestedTime, message: suggestionMessage } = req.body;

    if (!suggestedDate) {
      return res.status(400).json({ error: 'Suggested date is required' });
    }

    // Verify this booking is pending_partner and the caller is a non-primary participant
    const result = await pool.query(
      `SELECT b.id, b.status, b.student_user_id, b.date,
              s.name AS service_name,
              bp.user_id
       FROM bookings b
       JOIN booking_participants bp ON bp.booking_id = b.id
       LEFT JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND bp.user_id = $2 AND bp.is_primary = false`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or you are not a participant' });
    }

    if (result.rows[0].status !== 'pending_partner') {
      return res.status(400).json({ error: 'Booking is not awaiting partner confirmation' });
    }

    const booking = result.rows[0];
    const partnerName = req.user?.name || [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ') || 'Your partner';
    const timeStr = suggestedTime ? ` at ${suggestedTime}` : '';
    const msgSuffix = suggestionMessage ? ` — "${suggestionMessage}"` : '';
    const notifMsg = `${partnerName} suggested a different time for your ${booking.service_name || 'group'} lesson: ${suggestedDate}${timeStr}.${msgSuffix}`;

    try {
      await dispatchNotification({
        userId: booking.student_user_id,
        type: 'booking',
        title: 'Time Suggestion',
        message: notifMsg,
        data: {
          bookingId: id,
          action: 'partner_suggest_time',
          suggestedDate,
          suggestedTime,
          suggestionMessage,
        },
      });
    } catch (notifErr) {
      logger.warn('Failed to send time suggestion notification', { error: notifErr?.message });
    }

    if (req.socketService) {
      try {
        req.socketService.emitToChannel(`user:${booking.student_user_id}`, 'notification:new', {
          notification: {
            user_id: booking.student_user_id,
            title: 'Time Suggestion',
            message: notifMsg,
            type: 'booking',
            data: { bookingId: id, suggestedDate, suggestedTime },
            created_at: new Date().toISOString(),
          },
        });
      } catch (emitErr) {
        logger.warn('Failed to emit suggest-time event', { error: emitErr?.message });
      }
    }

    res.json({ success: true, message: 'Time suggestion sent to the organizer' });
  } catch (error) {
    logger.error('Error suggesting time for partner booking', { bookingId: req.params.id, error: error?.message });
    res.status(500).json({ error: 'Failed to suggest time' });
  }
});

// Booking-cancellation side effects, shared with the Kai agent routes so a
// cancel from any surface restores hours, refunds the wallet and clears the
// earnings/commission rows the same way.
export { restoreBookingPackageHours, refundBookingNetChargesPerUser, clearInstructorEarningsForBooking };

export default router;
