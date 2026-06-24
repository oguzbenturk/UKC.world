// Backfill membership manager_commissions to the BEACH-FEE-only base.
//
// Why: manager commission on memberships used to be 10% of the FULL bundled
// price (beach + storage). Migration 280 split the price (member_offerings /
// member_purchases.beach_fee_amount) and the commission paths now base the 10%
// on the beach portion only. This script re-derives source_amount +
// commission_amount for every UNPAID membership commission so existing pending
// rows reflect the new beach-only base (storage offerings backfill to 0 — the
// manager is no longer paid on storage).
//
// Safety:
//   - Default mode is --dry-run: prints per-row diffs, ROLLBACKs at the end.
//   - --commit actually writes. Single transaction; partial failure rolls back.
//   - Skips rows already paid out (payout_id IS NOT NULL) — paid history is
//     immutable (the recompute helper enforces this too).
//   - Idempotent: re-runs emit "no_change" for rows already correct.
//
// Usage:
//   node backend/scripts/backfill-membership-beach-commission.js --dry-run
//   node backend/scripts/backfill-membership-beach-commission.js --commit

import { pool } from '../db.js';
import { recomputeManagerCommissionForEntity } from '../services/managerCommissionService.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--commit');
const VERBOSE = args.has('--verbose') || args.has('-v');

const fmt = (n) => Number(n || 0).toFixed(2);

(async () => {
  const client = await pool.connect();
  await client.query('BEGIN');
  const summary = { total: 0, updated: 0, skippedPaidOut: 0, skippedNoChange: 0, skippedOther: 0, errors: 0 };
  const diffs = [];

  try {
    const { rows } = await client.query(`
      SELECT mc.id, mc.source_id, mc.source_amount, mc.commission_amount, mc.commission_rate
        FROM manager_commissions mc
       WHERE mc.source_type = 'membership'
         AND mc.status != 'cancelled'
         AND mc.payout_id IS NULL
       ORDER BY mc.source_date DESC, mc.id
    `);

    summary.total = rows.length;
    console.log(`\nRecomputing ${rows.length} unpaid membership commission(s) to beach-only base...\n`);

    for (const row of rows) {
      try {
        // source_id holds the member_purchases int id; the recompute helper's
        // 'member_purchase' branch re-derives the beach-only base (pro-rating any
        // discount) and updates the row.
        const result = await recomputeManagerCommissionForEntity(client, 'member_purchase', row.source_id);

        if (result?.updated) {
          summary.updated += 1;
          diffs.push({
            sourceId: row.source_id,
            old: fmt(result.oldSourceAmount), new: fmt(result.newSourceAmount),
            oldCmm: fmt(result.oldCommissionAmount), newCmm: fmt(result.newCommissionAmount),
          });
          if (VERBOSE) {
            console.log(`  [membership:${row.source_id}] src ${fmt(result.oldSourceAmount)} -> ${fmt(result.newSourceAmount)} | comm ${fmt(result.oldCommissionAmount)} -> ${fmt(result.newCommissionAmount)}`);
          }
          continue;
        }
        if (result?.skipped === 'no_change') { summary.skippedNoChange += 1; continue; }
        if (result?.skipped === 'paid_out') { summary.skippedPaidOut += 1; continue; }
        summary.skippedOther += 1;
        if (VERBOSE) console.log(`  [membership:${row.source_id}] skipped: ${result?.skipped || 'unknown'}`);
      } catch (err) {
        summary.errors += 1;
        console.error(`  [membership:${row.source_id}] error: ${err.message}`);
      }
    }

    console.log('\n========== Summary ==========');
    console.log(`Membership commissions inspected: ${summary.total}`);
    console.log(`  updated:         ${summary.updated}`);
    console.log(`  skipped (paid):  ${summary.skippedPaidOut}`);
    console.log(`  skipped (same):  ${summary.skippedNoChange}`);
    console.log(`  skipped (other): ${summary.skippedOther}`);
    console.log(`  errors:          ${summary.errors}`);

    if (!VERBOSE && diffs.length) {
      console.log('\n========== Diffs (first 40) ==========');
      diffs.slice(0, 40).forEach((d) => {
        console.log(`  membership:${d.sourceId}: src ${d.old} -> ${d.new} | comm ${d.oldCmm} -> ${d.newCmm}`);
      });
      if (diffs.length > 40) console.log(`  ...and ${diffs.length - 40} more (run with --verbose to see all)`);
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
