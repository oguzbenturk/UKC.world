// One-shot data fix for wallet balances corrupted by the "delete a paid
// booking from Financial History" flow (discovered 2026-08-12).
//
// ROOT CAUSE (now fixed in code — backend/routes/finances.js):
//   The customer-modal dependency-delete flow chains two endpoints:
//     1. DELETE /bookings/:id            → soft-deletes the booking and posts an
//        offsetting `booking_deleted_refund` credit (balance still correct);
//     2. DELETE /finances/transactions/:id?force=true on the original charge
//        → marks it status='cancelled' and recomputes wallet_balances from
//        SUM(completed) rows.
//   Step 2 had no idea the refund from step 1 exists purely to offset the
//   now-cancelled charge, so the refund survived every recompute as phantom
//   credit. Financial History hides BOTH rows (cancelled-status filter +
//   orphaned-booking filter), so the balance stayed wrong with nothing
//   visible to explain it. The code fix cancels the deleted booking's whole
//   remaining completed footprint when one of its rows is deleted.
//
// WHAT THIS DOES
//   Finds every (soft-deleted booking, user, currency) whose COMPLETED wallet
//   rows still net to a nonzero amount, i.e. the deleted booking still moves
//   the customer's balance.
//     * Groups carrying the bug signature — at least one sibling row cancelled
//       via the finances transaction-delete endpoint — are REPAIRED with
//       --apply: their remaining completed rows are cancelled (with a metadata
//       marker) and wallet_balances is recomputed from SUM(completed).
//     * Groups WITHOUT that signature are only REPORTED (other flows may
//       legitimately leave nonzero nets, e.g. a booking deleted while its
//       refund was blocked); nothing is touched.
//
// Idempotent — a second run finds nothing to repair.
//
// Usage (runs against whatever backend/.env points to — CHECK THAT FIRST):
//   node backend/scripts/repair-deleted-booking-phantom-footprints.mjs          # dry run
//   node backend/scripts/repair-deleted-booking-phantom-footprints.mjs --apply

import { pool } from '../db.js';

const APPLY = process.argv.includes('--apply');
const fmt = (v, cur = 'EUR') => `${Number(v || 0).toFixed(2)} ${cur}`;

const FOOTPRINT_LINK_SQL = `
  (wt.booking_id = $BID
   OR (wt.related_entity_type = 'booking' AND wt.related_entity_id = $BID))
`;

async function main() {
  const client = await pool.connect();
  try {
    const { rows: groups } = await client.query(`
      WITH tx AS (
        SELECT wt.id, wt.user_id, wt.currency, wt.status, wt.available_delta,
               wt.transaction_type, wt.amount, wt.metadata,
               COALESCE(wt.booking_id,
                        CASE WHEN wt.related_entity_type = 'booking' THEN wt.related_entity_id END) AS bid
          FROM wallet_transactions wt
         WHERE wt.booking_id IS NOT NULL
            OR (wt.related_entity_type = 'booking' AND wt.related_entity_id IS NOT NULL)
      ),
      agg AS (
        SELECT t.bid, t.user_id, COALESCE(t.currency, 'EUR') AS currency,
               SUM(CASE WHEN t.status = 'completed' THEN COALESCE(t.available_delta, t.amount, 0) ELSE 0 END) AS completed_net,
               COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_rows,
               COUNT(*) FILTER (WHERE t.status = 'cancelled'
                                  AND t.metadata->>'cancellationOrigin' LIKE 'finances_transaction_delete%') AS finances_delete_rows
          FROM tx t
         GROUP BY t.bid, t.user_id, COALESCE(t.currency, 'EUR')
      )
      SELECT a.bid, a.user_id, a.currency, a.completed_net, a.completed_rows,
             a.finances_delete_rows,
             b.date AS booking_date, b.deleted_at,
             u.name AS user_name,
             wb.available_amount AS cached_balance
        FROM agg a
        JOIN bookings b ON b.id = a.bid AND b.deleted_at IS NOT NULL
        JOIN users u ON u.id = a.user_id
   LEFT JOIN wallet_balances wb ON wb.user_id = a.user_id AND wb.currency = a.currency
       WHERE ABS(a.completed_net) >= 0.005
         AND a.completed_rows > 0
       ORDER BY u.name, b.date
    `);

    const repairable = groups.filter((g) => Number(g.finances_delete_rows) > 0);
    const reportOnly = groups.filter((g) => Number(g.finances_delete_rows) === 0);

    console.log(`\n=== Deleted-booking phantom footprints — ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
    console.log(`Found ${groups.length} nonzero footprint group(s): ${repairable.length} with the finances-delete signature (repairable), ${reportOnly.length} report-only.\n`);

    if (reportOnly.length > 0) {
      console.log('--- REPORT ONLY (no finances-delete signature — NOT touched) ---');
      for (const g of reportOnly) {
        console.log(`  ${g.user_name} · booking ${g.bid} (${new Date(g.booking_date).toISOString().slice(0, 10)}, deleted ${new Date(g.deleted_at).toISOString().slice(0, 10)}) · net ${fmt(g.completed_net, g.currency)} across ${g.completed_rows} completed row(s)`);
      }
      console.log('');
    }

    if (repairable.length === 0) {
      console.log('Nothing to repair.');
      return;
    }

    console.log('--- REPAIRABLE ---');
    for (const g of repairable) {
      const { rows: detail } = await client.query(
        `SELECT wt.id, wt.transaction_type, wt.amount, wt.available_delta, wt.description
           FROM wallet_transactions wt
          WHERE wt.user_id = $1 AND wt.status = 'completed'
            AND ${FOOTPRINT_LINK_SQL.replaceAll('$BID', '$2')}`,
        [g.user_id, g.bid]
      );
      console.log(`  ${g.user_name} · booking ${g.bid} (${new Date(g.booking_date).toISOString().slice(0, 10)}) · phantom ${fmt(g.completed_net, g.currency)} · cached balance ${fmt(g.cached_balance, g.currency)}`);
      for (const d of detail) {
        console.log(`      → cancel ${d.transaction_type} ${fmt(d.available_delta ?? d.amount, g.currency)} (${d.id}) "${(d.description || '').slice(0, 60)}"`);
      }
    }

    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to repair.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`SELECT set_config('wallet.allow_negative', 'true', false)`);
    const marker = JSON.stringify({
      cancellationOrigin: 'repair_deleted_booking_phantom_footprint',
      cancelledAt: new Date().toISOString(),
      repairScript: 'repair-deleted-booking-phantom-footprints.mjs'
    });

    const balanceKeys = new Set();
    for (const g of repairable) {
      const res = await client.query(
        `UPDATE wallet_transactions wt
            SET status = 'cancelled',
                metadata = COALESCE(wt.metadata, '{}'::jsonb) || $3::jsonb,
                updated_at = NOW()
          WHERE wt.user_id = $1 AND wt.status = 'completed'
            AND ${FOOTPRINT_LINK_SQL.replaceAll('$BID', '$2')}`,
        [g.user_id, g.bid, marker]
      );
      console.log(`  cancelled ${res.rowCount} row(s) for ${g.user_name} / booking ${g.bid}`);
      balanceKeys.add(`${g.user_id}|${g.currency}`);
    }

    for (const key of balanceKeys) {
      const [userId, currency] = key.split('|');
      const before = await client.query(
        `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
        [userId, currency]
      );
      await client.query(
        `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at)
         VALUES ($1, $2::varchar,
                 COALESCE((SELECT SUM(available_delta) FROM wallet_transactions WHERE user_id = $1 AND currency = $2::varchar AND status = 'completed'), 0),
                 COALESCE((SELECT SUM(pending_delta) FROM wallet_transactions WHERE user_id = $1 AND currency = $2::varchar AND status = 'completed'), 0),
                 COALESCE((SELECT SUM(non_withdrawable_delta) FROM wallet_transactions WHERE user_id = $1 AND currency = $2::varchar AND status = 'completed'), 0),
                 NOW())
         ON CONFLICT (user_id, currency) DO UPDATE SET
           available_amount = EXCLUDED.available_amount,
           pending_amount = EXCLUDED.pending_amount,
           non_withdrawable_amount = EXCLUDED.non_withdrawable_amount,
           updated_at = NOW()`,
        [userId, currency]
      );
      const after = await client.query(
        `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
        [userId, currency]
      );
      console.log(`  balance ${userId} ${currency}: ${fmt(before.rows[0]?.available_amount, currency)} → ${fmt(after.rows[0]?.available_amount, currency)}`);
    }

    await client.query('COMMIT');
    console.log(`\nRepaired ${repairable.length} footprint group(s).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Repair failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
