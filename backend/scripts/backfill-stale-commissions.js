// Backfill stale manager_commissions and instructor_earnings snapshots.
//
// Why: the snapshot model freezes source_amount / lesson_amount at booking
// creation. Discount cascades update them on the fly going forward, but rows
// that pre-date the cascade-completeness fixes (or that were created in flows
// that bypassed the cascade) stay stale forever. This script re-runs the
// modern derivation for every PENDING row so the totals shown to the manager
// — and the numbers a payout uses — match current entity + discount state.
//
// Safety:
//   - Default mode is --dry-run: prints per-row diffs, ROLLBACKs at the end.
//   - --commit actually writes. Single transaction; partial failure rolls back.
//   - Skips rows already paid out (manager_commissions.payout_id IS NOT NULL,
//     instructor_earnings.payroll_id IS NOT NULL) — paid history is immutable.
//   - Idempotent: re-runs only emit "no_change" for rows that are already
//     correct, so running twice is safe.
//
// Usage:
//   node backend/scripts/backfill-stale-commissions.js --dry-run
//   node backend/scripts/backfill-stale-commissions.js --commit

import { pool } from '../db.js';
import {
  recomputeManagerCommissionForEntity,
  getActiveDiscountAmount,
  derivePackageRentalAmount,
} from '../services/managerCommissionService.js';
import BookingUpdateCascadeService from '../services/bookingUpdateCascadeService.js';
import CurrencyService from '../services/currencyService.js';
import { toNumber } from '../utils/instructorEarnings.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--commit');
const VERBOSE = args.has('--verbose') || args.has('-v');

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

async function recomputePackageRental(client, commissionRow) {
  // Refresh a package-paid rental commission (recomputeManagerCommissionForEntity
  // intentionally skips these — packages drive their own cascade). Reuses
  // the same derivation helper as recordRentalCommission so the math stays
  // in lockstep.
  const { rows } = await client.query(
    `SELECT id, total_price, rental_days_used, payment_status, customer_package_id, currency
       FROM rentals
      WHERE id = $1::uuid AND deleted_at IS NULL
      LIMIT 1`,
    [commissionRow.source_id]
  );
  if (!rows.length) return null;
  const rental = rows[0];
  if (rental.payment_status !== 'package' || !rental.customer_package_id) return null;

  let sourceAmount = await derivePackageRentalAmount(client, rental);
  const rentalDiscount = await getActiveDiscountAmount(client, 'rental', rental.id);
  if (rentalDiscount > 0) {
    sourceAmount = Number.parseFloat(Math.max(0, sourceAmount - rentalDiscount).toFixed(2));
  }

  const sourceCurrency = rental.currency || 'EUR';
  let amountInEur = sourceAmount;
  if (sourceCurrency !== 'EUR') {
    try {
      amountInEur = await CurrencyService.convertCurrency(sourceAmount, sourceCurrency, 'EUR');
    } catch {
      amountInEur = sourceAmount;
    }
  }

  const rate = toNumber(commissionRow.commission_rate);
  const newCommissionAmount = Number.parseFloat(((amountInEur * rate) / 100).toFixed(2));

  const oldSourceAmount = toNumber(commissionRow.source_amount);
  const oldCommissionAmount = toNumber(commissionRow.commission_amount);
  if (Math.abs(oldSourceAmount - sourceAmount) < 0.005 &&
      Math.abs(oldCommissionAmount - newCommissionAmount) < 0.005) {
    return { skipped: 'no_change' };
  }

  await client.query(
    `UPDATE manager_commissions
        SET source_amount = $1,
            commission_amount = $2,
            notes = COALESCE(notes || ' | ', '') || $3,
            updated_at = NOW()
      WHERE id = $4`,
    [
      sourceAmount,
      newCommissionAmount,
      `Backfill: package-rental recompute (${oldSourceAmount.toFixed(2)} -> ${sourceAmount.toFixed(2)})`,
      commissionRow.id,
    ]
  );

  return {
    updated: true,
    oldSourceAmount,
    newSourceAmount: sourceAmount,
    oldCommissionAmount,
    newCommissionAmount,
  };
}

(async () => {
  const client = await pool.connect();
  await client.query('BEGIN');
  const summary = {
    cmTotal: 0,
    cmUpdated: 0,
    cmSkippedPaidOut: 0,
    cmSkippedNoChange: 0,
    cmSkippedOther: 0,
    cmErrors: 0,
    ieTotal: 0,
    ieUpdated: 0,
    ieSkippedPaidOut: 0,
    ieErrors: 0,
  };
  const diffs = [];

  try {
    // ─── 1. Manager commissions ────────────────────────────────────────────
    const { rows: cms } = await client.query(`
      SELECT mc.id, mc.source_type, mc.source_id,
             mc.source_amount, mc.commission_amount, mc.commission_rate,
             mc.payout_id, mc.status, mc.source_date
        FROM manager_commissions mc
       WHERE mc.status != 'cancelled'
         AND mc.payout_id IS NULL
       ORDER BY mc.source_date DESC, mc.id
    `);

    summary.cmTotal = cms.length;
    console.log(`\n[1/2] Recomputing ${cms.length} pending manager_commissions...\n`);

    for (const row of cms) {
      try {
        // Try the standard recompute path first.
        const result = await recomputeManagerCommissionForEntity(
          client,
          row.source_type,
          row.source_id,
        );

        if (result?.updated) {
          summary.cmUpdated += 1;
          diffs.push({
            kind: 'manager',
            sourceType: row.source_type,
            sourceId: row.source_id,
            old: fmt(result.oldSourceAmount),
            new: fmt(result.newSourceAmount),
            oldCmm: fmt(result.oldCommissionAmount),
            newCmm: fmt(result.newCommissionAmount),
          });
          if (VERBOSE) {
            console.log(
              `  [CM ${row.source_type}:${row.source_id}] ${fmt(result.oldSourceAmount)} -> ${fmt(result.newSourceAmount)} ` +
              `(comm ${fmt(result.oldCommissionAmount)} -> ${fmt(result.newCommissionAmount)})`
            );
          }
          continue;
        }

        if (result?.skipped === 'no_change') {
          summary.cmSkippedNoChange += 1;
          continue;
        }
        if (result?.skipped === 'paid_out') {
          summary.cmSkippedPaidOut += 1;
          continue;
        }
        if (result?.skipped === 'package_paid' && row.source_type === 'rental') {
          // Recompute package-paid rentals via the dedicated path (the
          // standard helper intentionally skips them so the package-driven
          // cascade can own that math).
          const pkgResult = await recomputePackageRental(client, row);
          if (pkgResult?.updated) {
            summary.cmUpdated += 1;
            diffs.push({
              kind: 'manager-pkg-rental',
              sourceType: row.source_type,
              sourceId: row.source_id,
              old: fmt(pkgResult.oldSourceAmount),
              new: fmt(pkgResult.newSourceAmount),
              oldCmm: fmt(pkgResult.oldCommissionAmount),
              newCmm: fmt(pkgResult.newCommissionAmount),
            });
            if (VERBOSE) {
              console.log(
                `  [CM rental(pkg):${row.source_id}] ${fmt(pkgResult.oldSourceAmount)} -> ${fmt(pkgResult.newSourceAmount)} ` +
                `(comm ${fmt(pkgResult.oldCommissionAmount)} -> ${fmt(pkgResult.newCommissionAmount)})`
              );
            }
          } else if (pkgResult?.skipped === 'no_change') {
            summary.cmSkippedNoChange += 1;
          } else {
            summary.cmSkippedOther += 1;
          }
          continue;
        }
        summary.cmSkippedOther += 1;
      } catch (err) {
        summary.cmErrors += 1;
        console.error(
          `  [CM error ${row.source_type}:${row.source_id}] ${err.message}`,
        );
      }
    }

    // ─── 2. Instructor earnings ────────────────────────────────────────────
    // Walk every pending earnings row; updateInstructorEarnings reuses
    // computeBookingTotalAmount, so the math is identical to manager
    // commissions and instructor payouts will agree.
    const { rows: bks } = await client.query(`
      SELECT b.*
        FROM bookings b
        JOIN instructor_earnings ie ON ie.booking_id = b.id
       WHERE ie.payroll_id IS NULL
         AND b.deleted_at IS NULL
         AND b.instructor_user_id IS NOT NULL
       ORDER BY b.date DESC, b.id
    `);

    summary.ieTotal = bks.length;
    console.log(`\n[2/2] Recomputing ${bks.length} pending instructor_earnings...\n`);

    for (const booking of bks) {
      try {
        // updateInstructorEarnings now returns old+new values so we don't
        // need separate pre/post SELECTs around it.
        const result = await BookingUpdateCascadeService.updateInstructorEarnings(client, booking);
        if (result?.skipped === 'paid_out') {
          summary.ieSkippedPaidOut += 1;
          continue;
        }
        if (!result || !result.updated) continue;

        const { oldLessonAmount, oldTotalEarnings, lessonAmount, totalEarnings } = result;
        if (Math.abs(oldLessonAmount - lessonAmount) > 0.005 ||
            Math.abs(oldTotalEarnings - totalEarnings) > 0.005) {
          summary.ieUpdated += 1;
          diffs.push({
            kind: 'instructor',
            bookingId: booking.id,
            oldLesson: fmt(oldLessonAmount),
            newLesson: fmt(lessonAmount),
            oldEarnings: fmt(oldTotalEarnings),
            newEarnings: fmt(totalEarnings),
          });
          if (VERBOSE) {
            console.log(
              `  [IE ${booking.id}] lesson ${fmt(oldLessonAmount)} -> ${fmt(lessonAmount)} ` +
              `(earnings ${fmt(oldTotalEarnings)} -> ${fmt(totalEarnings)})`
            );
          }
        }
      } catch (err) {
        summary.ieErrors += 1;
        console.error(`  [IE error ${booking.id}] ${err.message}`);
      }
    }

    // ─── Summary ───────────────────────────────────────────────────────────
    console.log('\n========== Summary ==========');
    console.log(`Manager commissions inspected: ${summary.cmTotal}`);
    console.log(`  updated:           ${summary.cmUpdated}`);
    console.log(`  skipped (paid):    ${summary.cmSkippedPaidOut}`);
    console.log(`  skipped (same):    ${summary.cmSkippedNoChange}`);
    console.log(`  skipped (other):   ${summary.cmSkippedOther}`);
    console.log(`  errors:            ${summary.cmErrors}`);
    console.log(`Instructor earnings inspected: ${summary.ieTotal}`);
    console.log(`  updated:           ${summary.ieUpdated}`);
    console.log(`  errors:            ${summary.ieErrors}`);

    if (!VERBOSE && diffs.length) {
      console.log('\n========== Diffs (first 30) ==========');
      diffs.slice(0, 30).forEach((d) => {
        if (d.kind === 'instructor') {
          console.log(
            `  IE ${d.bookingId}: lesson ${d.oldLesson} -> ${d.newLesson} | earnings ${d.oldEarnings} -> ${d.newEarnings}`
          );
        } else {
          console.log(
            `  CM ${d.kind === 'manager-pkg-rental' ? 'rental(pkg)' : d.sourceType}:${d.sourceId}: ` +
            `src ${d.old} -> ${d.new} | cmm ${d.oldCmm} -> ${d.newCmm}`
          );
        }
      });
      if (diffs.length > 30) console.log(`  ...and ${diffs.length - 30} more (run with --verbose to see all)`);
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\nDRY-RUN: rolled back. Re-run with --commit to persist.');
    } else {
      await client.query('COMMIT');
      console.log('\nCOMMITTED.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nBackfill aborted:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
