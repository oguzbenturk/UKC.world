// One-shot data fix for the €0 instructor-commission overrides discovered on
// 2026-08-12 (Dinçer Yazgan / Olcay Aktan, 2026-08-08, 2h €120 → €0 earned).
//
// ROOT CAUSE (all three now fixed in code):
//   1. GET /api/instructors carried no auth middleware, so `req.user` was always
//      undefined and the response NEVER included `commission_rate`
//      (backend/routes/instructors.js).
//   2. The booking edit modal read that missing field as `commission_rate || 0`,
//      so its "Reset" button and its zero-recovery guard both set the commission
//      to 0 — and the input renders blank at 0, so nothing looked wrong
//      (src/features/bookings/components/components/BookingDetailModal.jsx).
//   3. The modal shipped `instructor_commission` on EVERY save and the backend
//      accepted 0 as a deliberate override, writing a permanent
//      booking_custom_commissions row that outranks the instructor's rate
//      (backend/routes/bookings.js).
//
// A booking_custom_commissions row beats instructor_service_commissions,
// instructor_category_rates AND instructor_default_commissions, and
// deriveTotalEarnings() short-circuits `rate <= 0 → 0`. So each €0 row silently
// erased one lesson's instructor earnings while the customer charge and the
// manager commission stayed correct.
//
// WHAT THIS DOES
//   * ZERO ROWS (always): deletes every commission_value = 0 override.
//   * REDUNDANT ROWS (--clean-redundant): deletes overrides identical to the
//     rate the booking's CURRENT instructor would resolve to anyway. These
//     usually change nothing, but they freeze the booking against future rate
//     changes.
//   Either way the lesson is then re-costed through the canonical
//   BookingUpdateCascadeService.updateInstructorEarnings, so this repair can
//   never drift from live app behaviour.
//
// A NOTE ON REASSIGNED BOOKINGS
//   The override stores its own instructor_id. When a booking was later moved to
//   a different instructor, the stale row kept paying the ORIGINAL instructor's
//   rate while someone else taught the lesson. Deleting it therefore CHANGES the
//   payout — correctly. Those rows are flagged `reassigned` below and the dry run
//   prints the exact before → after for every single row, so nothing is a
//   surprise. Nothing is written unless --apply is passed.
//
// Rows already attached to a payroll run (payroll_id IS NOT NULL) are reported
// and skipped: paying out and then changing the number would leave the
// instructor over/under-paid relative to what was settled. Soft-deleted
// bookings are skipped too.
//
// Idempotent — a second run finds nothing to delete.
//
// Usage (runs against whatever backend/.env points to — CHECK THAT FIRST):
//   node backend/scripts/repair-zero-commission-overrides.mjs                  # dry run
//   node backend/scripts/repair-zero-commission-overrides.mjs --apply
//   node backend/scripts/repair-zero-commission-overrides.mjs --apply --clean-redundant

import { pool } from '../db.js';
import BookingUpdateCascadeService from '../services/bookingUpdateCascadeService.js';
import { invalidateInstructorDashboardCache } from '../services/instructorService.js';

const APPLY = process.argv.includes('--apply');
const CLEAN_REDUNDANT = process.argv.includes('--clean-redundant');

const eur = (v) => `€${Number(v || 0).toFixed(2)}`;
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

// Every override row alongside the rate the booking WOULD resolve to with no
// override. The default is resolved against b.instructor_user_id — the person
// who actually gets PAID — not bcc.instructor_id, which on a reassigned booking
// still points at whoever was originally scheduled. Same priority and the same
// semi-private-supervision category mapping the read path uses.
const CANDIDATES_SQL = `
  SELECT
    bcc.booking_id,
    bcc.commission_type  AS override_type,
    bcc.commission_value AS override_value,
    (bcc.instructor_id IS DISTINCT FROM b.instructor_user_id) AS reassigned,
    b.date, b.duration, b.amount, b.status, b.group_size, b.deleted_at,
    inst.name AS instructor_name,
    cust.name AS customer_name,
    srv.name  AS service_name,
    COALESCE(isc.commission_type, icr.rate_type, idc.commission_type, 'fixed') AS default_type,
    COALESCE(isc.commission_value, icr.rate_value, idc.commission_value)       AS default_value,
    ie.payroll_id,
    ie.total_earnings AS current_earnings
  FROM booking_custom_commissions bcc
  JOIN bookings b        ON b.id = bcc.booking_id
  LEFT JOIN users inst   ON inst.id = b.instructor_user_id
  LEFT JOIN users cust   ON cust.id = COALESCE(b.customer_user_id, b.student_user_id)
  LEFT JOIN services srv ON srv.id = b.service_id
  LEFT JOIN instructor_service_commissions isc
         ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
  LEFT JOIN instructor_category_rates icr
         ON icr.instructor_id = b.instructor_user_id
        AND icr.lesson_category = (
              CASE
                WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
                  THEN 'semi-private-supervision'
                ELSE srv.lesson_category_tag
              END
            )
  LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
  LEFT JOIN instructor_earnings ie ON ie.booking_id = b.id
  ORDER BY b.date DESC
`;

// Delete the override and re-cost the lesson through the app's own cascade.
// In dry-run mode the whole thing is rolled back, so the projected number is
// produced by exactly the code path --apply would run — never a reimplementation.
async function recost(client, bookingId, { commit }) {
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM booking_custom_commissions WHERE booking_id = $1', [bookingId]);
    const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    const result = await BookingUpdateCascadeService.updateInstructorEarnings(client, booking);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return { booking, result };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

let exitCode = 0;
const client = await pool.connect();

try {
  const { rows: all } = await client.query(CANDIDATES_SQL);

  const isRedundant = (r) =>
    r.default_value !== null &&
    r.override_type === r.default_type &&
    Number(r.override_value) === Number(r.default_value);

  const zeros = all.filter((r) => Number(r.override_value) === 0);
  const redundant = all.filter((r) => Number(r.override_value) !== 0 && isRedundant(r));
  const targets = [...zeros, ...(CLEAN_REDUNDANT ? redundant : [])];

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — booking_custom_commissions repair`);
  console.log(`  ${all.length} override rows · ${zeros.length} at €0 · ${redundant.length} identical to the booking instructor's own rate`);
  console.log(`  ${all.filter((r) => r.reassigned).length} rows are stamped to a DIFFERENT instructor than the booking is now assigned to\n`);

  if (targets.length === 0) console.log('  Nothing to repair.\n');
  else console.log(
    `  ${pad('DATE', 11)}${pad('INSTRUCTOR', 18)}${pad('CUSTOMER', 18)}${pad('DUR', 6)}${pad('OVERRIDE', 12)}${pad('REAL RATE', 13)}${pad('EARNINGS', 22)}NOTE`
  );

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let delta = 0;
  const touchedInstructors = new Set();
  const movers = [];

  for (const r of targets) {
    const overrideLabel = r.override_type === 'percentage' ? `${Number(r.override_value)}%` : eur(r.override_value);
    const defaultLabel = r.default_value === null
      ? '(none)'
      : r.default_type === 'percentage' ? `${Number(r.default_value)}%` : `${eur(r.default_value)}/h`;

    let earningsCol = eur(r.current_earnings);
    let note = r.reassigned ? 'reassigned' : '';

    if (r.payroll_id) {
      note = 'SKIP — already paid out (payroll_id set)';
      skipped += 1;
    } else if (r.deleted_at) {
      note = 'SKIP — booking is soft-deleted';
      skipped += 1;
    } else if (r.default_value === null) {
      note = 'SKIP — no rate configured for this instructor';
      skipped += 1;
    } else {
      try {
        const { booking, result } = await recost(client, r.booking_id, { commit: APPLY });
        if (result?.skipped) {
          note = `${note ? note + ' · ' : ''}recompute skipped (${result.skipped})`;
          skipped += 1;
        } else {
          const before = Number(r.current_earnings || 0);
          const after = Number(result?.totalEarnings ?? 0);
          earningsCol = `${eur(before)} → ${eur(after)}`;
          if (Math.abs(after - before) >= 0.01) {
            changed += 1;
            delta += after - before;
            note = `${note ? note + ' · ' : ''}CHANGES PAYOUT ${after > before ? '+' : ''}${eur(after - before)}`;
            movers.push({ ...r, before, after });
          } else {
            unchanged += 1;
          }
          if (APPLY && booking.instructor_user_id) touchedInstructors.add(booking.instructor_user_id);
        }
      } catch (err) {
        note = `FAILED — ${err.message}`;
        exitCode = 1;
      }
    }

    console.log(
      `  ${pad(String(r.date).slice(0, 10), 11)}${pad(r.instructor_name, 18)}${pad(r.customer_name, 18)}${pad(`${Number(r.duration)}h`, 6)}${pad(overrideLabel, 12)}${pad(defaultLabel, 13)}${pad(earningsCol, 22)}${note}`
    );
  }

  if (movers.length > 0) {
    console.log(`\n  ${movers.length} lesson(s) change payout — review these before approving:`);
    for (const m of movers) {
      console.log(
        `    ${String(m.date).slice(0, 10)}  ${m.instructor_name} / ${m.customer_name}  ${eur(m.before)} → ${eur(m.after)}${m.reassigned ? '   (booking was reassigned; the override still paid the previous instructor\'s rate)' : ''}`
      );
    }
  }

  if (!CLEAN_REDUNDANT && redundant.length > 0) {
    console.log(`\n  Note: ${redundant.length} further override rows merely duplicate the instructor's own rate.`);
    console.log('  Re-run with --clean-redundant to drop them so future rate changes reach those bookings.');
  }

  console.log(`\n  ${changed} changed · ${unchanged} unchanged · ${skipped} skipped · net payout delta ${delta >= 0 ? '+' : ''}${eur(delta)}`);
  console.log(APPLY ? '  Committed.\n' : '  DRY RUN — every transaction above was rolled back. Re-run with --apply to commit.\n');

  if (APPLY) {
    for (const instructorId of touchedInstructors) {
      await invalidateInstructorDashboardCache(instructorId).catch(() => {});
    }
    if (touchedInstructors.size > 0) console.log(`  Busted dashboard cache for ${touchedInstructors.size} instructor(s).\n`);
  }
} catch (err) {
  console.error('Repair failed:', err);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
