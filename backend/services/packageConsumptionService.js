/**
 * Package Consumption Service
 *
 * Cross-package FIFO spillover: a single lesson draws hours from a customer's
 * compatible packages oldest-first, spilling into the next package when one runs
 * out, and only overflowing to cash when the whole pool is exhausted. Every draw
 * is recorded in the booking_package_consumption ledger (migration 278) with a
 * FROZEN per-hour rate, so revenue/commission stay stable if a package price is
 * later edited.
 *
 * The ledger is the source of truth for reversal: restore (cancel/delete),
 * partial release (duration-down edit) and re-consume (restore-from-soft-delete)
 * all read it, so reversal no longer GUESSES hours from duration.
 *
 * Legacy bookings have no ledger rows; every caller keeps a legacy fallback so
 * they behave exactly as before.
 */

import BookingUpdateCascadeService from './bookingUpdateCascadeService.js';
import { getEligiblePackagesForLesson } from './packagePoolService.js';
import { logger } from '../middlewares/errorHandler.js';

const EPS = 0.0001;

// Kill switch. When disabled, consumption caps at the FIRST matching package
// (today's single-package behaviour) — only the ledger plumbing still lands.
export const SPILLOVER_ENABLED = process.env.PACKAGE_SPILLOVER_ENABLED !== 'false';

// Race-safe guarded decrement, lifted verbatim from the original POST /bookings
// package consumption so used_up / waiting_payment / all-inclusive (rental+accom
// must also be empty) semantics match exactly.
const GUARDED_CONSUME_SQL = `
  UPDATE customer_packages
     SET used_hours = $1::numeric,
         remaining_hours = $2::numeric,
         last_used_date = COALESCE($5, last_used_date),
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
  RETURNING id, package_name, used_hours, remaining_hours, status`;

async function _restoreHoursToPackage(client, pkgId, restoreHours) {
  if (!pkgId || !(restoreHours > 0)) return null;
  const { rows } = await client.query(
    `SELECT id, package_name, total_hours, used_hours, remaining_hours, status
       FROM customer_packages WHERE id = $1`,
    [pkgId]
  );
  if (!rows.length) return null;
  const pkg = rows[0];
  const newUsed = Math.max(0, (parseFloat(pkg.used_hours) || 0) - parseFloat(restoreHours));
  const newRemaining = Math.min(
    parseFloat(pkg.total_hours) || 0,
    (parseFloat(pkg.remaining_hours) || 0) + parseFloat(restoreHours)
  );
  // A package that gets hours back is usable again, unless it carries a
  // payment-intent status (waiting/pending/cancelled) we must not overwrite.
  const newStatus = newRemaining > 0 && pkg.status === 'used_up' ? 'active' : pkg.status;
  const { rows: upd } = await client.query(
    `UPDATE customer_packages
        SET used_hours = $1, remaining_hours = $2, status = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING package_name, used_hours, remaining_hours, status`,
    [newUsed, newRemaining, newStatus, pkgId]
  );
  if (!upd.length) return null;
  return {
    packageId: pkgId,
    packageName: upd[0].package_name,
    hoursRestored: parseFloat(restoreHours),
    newUsedHours: upd[0].used_hours,
    newRemainingHours: upd[0].remaining_hours,
    newStatus: upd[0].status,
  };
}

// Decrement `take` hours from one package via the guarded UPDATE, retrying once
// against the live remaining if a concurrent booking raced us. Returns the
// updated row or null if it couldn't be consumed.
async function _consumeOne(client, pkgRow, take, lastUsedDate) {
  let want = take;
  for (let attempt = 0; attempt < 2 && want > EPS; attempt++) {
    const { rows } = await client.query(
      `SELECT used_hours, total_hours,
              COALESCE(remaining_hours, total_hours - COALESCE(used_hours, 0)) AS live_remaining
         FROM customer_packages WHERE id = $1`,
      [pkgRow.id]
    );
    if (!rows.length) return null;
    const used = parseFloat(rows[0].used_hours) || 0;
    const liveRemaining = parseFloat(rows[0].live_remaining) || 0;
    want = Math.min(want, liveRemaining);
    if (want <= EPS) return null;
    const newUsed = used + want;
    const newRemaining = liveRemaining - want;
    const res = await client.query(GUARDED_CONSUME_SQL, [
      newUsed, newRemaining, pkgRow.id, want, lastUsedDate || null,
    ]);
    if (res.rows.length) return { ...res.rows[0], consumed: want };
  }
  return null;
}

/**
 * Consume `hoursNeeded` from a customer's compatible packages FIFO. Does NOT
 * write the ledger (the booking/participant row may not exist yet) — the caller
 * records draws via recordConsumptionLedger once it has the id.
 *
 * @returns {Promise<{ draws: Array, packageHoursTotal: number, cashHours: number,
 *   primaryPackageId: string|null, primaryPackageName: string|null,
 *   primaryOriginalStatus: string|null }>}
 *   draws: [{ packageId, packageName, hours, ratePerHour, newRemaining, newStatus,
 *             originalStatus, totalHours, purchasePrice, currency }]
 */
export async function consumeAcrossPackages(client, {
  customerId,
  hoursNeeded,
  matchCriteria = {},
  requestedPackageId = null,
  asOfDate = null,
  allowWaitingPayment = true,
  allowSpillover = SPILLOVER_ENABLED,
} = {}) {
  const empty = {
    draws: [], packageHoursTotal: 0, cashHours: Math.max(0, parseFloat(hoursNeeded) || 0),
    primaryPackageId: null, primaryPackageName: null, primaryOriginalStatus: null,
  };
  let need = parseFloat(hoursNeeded) || 0;
  if (!customerId || need <= EPS) return { ...empty, cashHours: Math.max(0, need) };

  let pool = await getEligiblePackagesForLesson(client, {
    customerId,
    serviceName: matchCriteria.serviceName || null,
    lessonCategoryTag: matchCriteria.lessonCategoryTag || null,
    disciplineTag: matchCriteria.disciplineTag || null,
    asOfDate,
    allowWaitingPayment,
  });

  // Manual override: pin the staff-selected package to the front of the chain.
  if (requestedPackageId) {
    const idx = pool.findIndex((p) => String(p.id) === String(requestedPackageId));
    if (idx > 0) {
      pool = [pool[idx], ...pool.slice(0, idx), ...pool.slice(idx + 1)];
    } else if (idx === -1) {
      // Pinned package isn't in the auto-matched pool (e.g. staff chose one the
      // matcher wouldn't pick). Honour it as the first draw if it's a valid,
      // owned, in-hours package, then chain the rest of the pool after it.
      const { rows } = await client.query(
        `SELECT cp.id, cp.package_name, cp.total_hours, cp.used_hours, cp.remaining_hours,
                COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) AS live_remaining,
                cp.purchase_price, cp.currency, cp.status, cp.lesson_service_name
           FROM customer_packages cp
          WHERE cp.id = $1 AND cp.customer_id = $2
            AND cp.status IN ('active', 'waiting_payment')
            AND COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) > 0`,
        [requestedPackageId, customerId]
      );
      if (rows.length) pool = [rows[0], ...pool];
    }
  }

  const draws = [];
  for (const pkg of pool) {
    if (need <= EPS) break;
    if (!allowSpillover && draws.length >= 1) break; // kill switch: single package only
    const take = Math.min(need, parseFloat(pkg.live_remaining) || 0);
    if (take <= EPS) continue;
    const consumed = await _consumeOne(client, pkg, take, asOfDate);
    if (!consumed) continue;
    const ratePerHour = await BookingUpdateCascadeService.computeEffectivePackageHourlyRate(client, pkg.id);
    draws.push({
      packageId: pkg.id,
      packageName: consumed.package_name,
      hours: parseFloat(consumed.consumed.toFixed(2)),
      ratePerHour,
      newRemaining: parseFloat(consumed.remaining_hours),
      newStatus: consumed.status,
      originalStatus: pkg.status,
      totalHours: parseFloat(pkg.total_hours) || 0,
      purchasePrice: parseFloat(pkg.purchase_price) || 0,
      currency: pkg.currency || 'EUR',
    });
    need = parseFloat((need - consumed.consumed).toFixed(4));
  }

  const packageHoursTotal = parseFloat(draws.reduce((s, d) => s + d.hours, 0).toFixed(2));
  const cashHours = Math.max(0, parseFloat(need.toFixed(2)));
  return {
    draws,
    packageHoursTotal,
    cashHours,
    primaryPackageId: draws[0]?.packageId || null,
    primaryPackageName: draws[0]?.packageName || null,
    primaryOriginalStatus: draws[0]?.originalStatus || null,
  };
}

/** Persist the per-package draws of a (booking[, participant]) once its id exists. */
export async function recordConsumptionLedger(client, { bookingId, participantId = null, draws = [] }) {
  if (!bookingId || !draws.length) return;
  for (const d of draws) {
    if (!d.packageId || !(d.hours > 0)) continue;
    await client.query(
      `INSERT INTO booking_package_consumption
         (booking_id, participant_id, customer_package_id, hours_used, rate_per_hour)
       VALUES ($1, $2, $3, $4, $5)`,
      [bookingId, participantId, d.packageId, d.hours, Number.isFinite(d.ratePerHour) ? d.ratePerHour : null]
    );
  }
}

/** True if a booking has any (non-released) spillover ledger rows. */
export async function hasLedgerRows(client, bookingId) {
  if (!bookingId) return false;
  const { rows } = await client.query(
    `SELECT 1 FROM booking_package_consumption WHERE booking_id = $1 AND released_at IS NULL LIMIT 1`,
    [bookingId]
  );
  return rows.length > 0;
}

function _scopeClause(participantId, startIdx) {
  // participantId null  → booking-level rows (participant_id IS NULL)
  // participantId set   → that participant's rows
  return participantId
    ? { clause: `participant_id = $${startIdx}`, params: [participantId] }
    : { clause: `participant_id IS NULL`, params: [] };
}

/**
 * Restore the hours a booking/participant drew back to each package and mark the
 * ledger rows released (NOT deleted) so a later restore can re-consume exactly.
 * Used on cancel / delete.
 */
export async function restoreFromLedger(client, { bookingId, participantId = null }) {
  if (!bookingId) return [];
  const scope = _scopeClause(participantId, 2);
  const { rows } = await client.query(
    `SELECT id, customer_package_id, hours_used
       FROM booking_package_consumption
      WHERE booking_id = $1 AND released_at IS NULL AND ${scope.clause}`,
    [bookingId, ...scope.params]
  );
  const results = [];
  for (const row of rows) {
    const r = await _restoreHoursToPackage(client, row.customer_package_id, parseFloat(row.hours_used));
    if (r) results.push(r);
    await client.query(
      `UPDATE booking_package_consumption SET released_at = NOW() WHERE id = $1`,
      [row.id]
    );
  }
  return results;
}

/**
 * Partial release (LIFO — newest draw first) for a duration-DOWN edit. Reduces
 * each touched row's hours_used so the ledger sum keeps matching the booking's
 * package hours. Returns total hours released.
 */
export async function releaseHoursFromLedger(client, { bookingId, participantId = null, hoursToRelease }) {
  if (!bookingId || !(hoursToRelease > 0)) return 0;
  const scope = _scopeClause(participantId, 2);
  const { rows } = await client.query(
    `SELECT id, customer_package_id, hours_used
       FROM booking_package_consumption
      WHERE booking_id = $1 AND released_at IS NULL AND ${scope.clause}
      ORDER BY seq DESC`,
    [bookingId, ...scope.params]
  );
  let toRelease = parseFloat(hoursToRelease);
  let released = 0;
  for (const row of rows) {
    if (toRelease <= EPS) break;
    const rowHours = parseFloat(row.hours_used) || 0;
    const give = Math.min(toRelease, rowHours);
    if (give <= EPS) continue;
    await _restoreHoursToPackage(client, row.customer_package_id, give);
    if (give >= rowHours - EPS) {
      await client.query(`UPDATE booking_package_consumption SET released_at = NOW() WHERE id = $1`, [row.id]);
    } else {
      await client.query(
        `UPDATE booking_package_consumption SET hours_used = hours_used - $1 WHERE id = $2`,
        [parseFloat(give.toFixed(2)), row.id]
      );
    }
    toRelease = parseFloat((toRelease - give).toFixed(4));
    released = parseFloat((released + give).toFixed(4));
  }
  return released;
}

/**
 * Consume additional hours for a duration-UP edit, chaining across the pool the
 * same way create does, and append new ledger rows to the booking/participant.
 * Returns the consumption result (draws/cashHours). The caller settles the cash
 * leg and updates package_hours_used.
 */
export async function consumeAdditionalForBooking(client, {
  bookingId,
  participantId = null,
  customerId,
  hoursNeeded,
  matchCriteria = {},
  asOfDate = null,
  allowSpillover = SPILLOVER_ENABLED,
}) {
  const result = await consumeAcrossPackages(client, {
    customerId, hoursNeeded, matchCriteria, asOfDate, allowSpillover,
  });
  await recordConsumptionLedger(client, { bookingId, participantId, draws: result.draws });
  return result;
}

/**
 * Re-consume the exact released draws when a soft-deleted booking is restored
 * (inverse of restoreFromLedger). Clears released_at and re-decrements packages.
 */
export async function reconsumeFromLedger(client, { bookingId, participantId = null }) {
  if (!bookingId) return;
  const scope = _scopeClause(participantId, 2);
  const { rows } = await client.query(
    `SELECT id, customer_package_id, hours_used
       FROM booking_package_consumption
      WHERE booking_id = $1 AND released_at IS NOT NULL AND ${scope.clause}`,
    [bookingId, ...scope.params]
  );
  for (const row of rows) {
    await client.query(
      `UPDATE customer_packages
          SET used_hours = COALESCE(used_hours, 0) + $1,
              remaining_hours = GREATEST(0, COALESCE(remaining_hours, 0) - $1),
              status = CASE WHEN GREATEST(0, COALESCE(remaining_hours, 0) - $1) <= 0 AND status = 'active'
                            THEN 'used_up' ELSE status END,
              updated_at = NOW()
        WHERE id = $2`,
      [parseFloat(row.hours_used), row.customer_package_id]
    );
    await client.query(`UPDATE booking_package_consumption SET released_at = NULL WHERE id = $1`, [row.id]);
  }
}

export default {
  SPILLOVER_ENABLED,
  consumeAcrossPackages,
  recordConsumptionLedger,
  consumeAdditionalForBooking,
  hasLedgerRows,
  restoreFromLedger,
  releaseHoursFromLedger,
  reconsumeFromLedger,
};
