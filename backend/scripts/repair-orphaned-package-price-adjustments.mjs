// Data repair: `package_price_adjustment` ledger rows that outlived their package
// (found 2026-09-06, customer Mercan KS23 — wallet −279.49 EUR instead of +0.51).
//
// THE DISEASE
//
// A package that was price-edited or upgraded carries one `package_price_adjustment`
// wallet row per edit (the ±delta of that edit, tagged to the package). Deleting the
// package's purchase transaction from Finances *with cascade* cancelled the purchase,
// reversed the discount credit and hard-deleted the package — but never touched the
// adjustment rows. The delta stayed a live debit tagged to a package that no longer
// exists. Financial History hides rows whose package is gone, so the wallet was wrong
// with nothing visible on screen to explain it.
//
// Fixed in code (same commit): forceDeleteCustomerPackage({ cancelLinkedCharges: true })
// now cancels the package's remaining purchase + price-adjustment rows in the cascade
// path. This script repairs rows the bug already left behind.
//
// THE CURE
//
// A completed `package_price_adjustment` is repaired when
//   • its customer_package row no longer exists, AND
//   • the package has NO completed `package_purchase` and NO completed `package_refund`
//     left in the ledger (the purchase was cancelled or hard-deleted = cascade path).
//
// The services.js refund path is deliberately EXCLUDED: it keeps the purchase completed
// and writes a `package_refund` computed from the post-edit price, so its adjustment
// rows are legitimately orphaned and must stay completed to net against the refund.
//
//   1. status → 'cancelled' (cancel-only, no reversal row — see wiki Finances_Wallet)
//   2. recompute wallet_balances for every touched wallet from the completed ledger
//
// Idempotent: a second run finds nothing to change.
//
// Usage (runs against whatever backend/.env points to):
//   node backend/scripts/repair-orphaned-package-price-adjustments.mjs           # dry run
//   node backend/scripts/repair-orphaned-package-price-adjustments.mjs --apply   # write

import { pool } from '../db.js';
import { recomputeBalanceFromLedger } from '../services/walletService.js';

const APPLY = process.argv.includes('--apply');
const fmt = (v) => Number(v ?? 0).toFixed(2);

const client = await pool.connect();
let exitCode = 0;

try {
  const { rows: candidates } = await client.query(`
    SELECT wt.id, wt.user_id, wt.currency, wt.amount, wt.available_delta, wt.description,
           wt.transaction_date, wt.related_entity_id AS package_id,
           u.first_name, u.last_name, u.email,
           (SELECT string_agg(p.transaction_type || '=' || p.status, ', ' ORDER BY p.created_at)
              FROM wallet_transactions p
             WHERE p.related_entity_type = 'customer_package'
               AND p.related_entity_id = wt.related_entity_id
               AND p.transaction_type IN ('package_purchase', 'package_refund')) AS sibling_rows
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
     WHERE wt.transaction_type = 'package_price_adjustment'
       AND wt.status = 'completed'
       AND wt.related_entity_type = 'customer_package'
       AND NOT EXISTS (SELECT 1 FROM customer_packages cp WHERE cp.id = wt.related_entity_id)
       AND NOT EXISTS (
             SELECT 1 FROM wallet_transactions p
              WHERE p.related_entity_type = 'customer_package'
                AND p.related_entity_id = wt.related_entity_id
                AND p.status = 'completed'
                AND p.transaction_type IN ('package_purchase', 'package_refund'))
     ORDER BY u.last_name, u.first_name, wt.transaction_date
  `);

  // Informational: orphaned adjustments we deliberately leave alone (refund path).
  const { rows: skipped } = await client.query(`
    SELECT wt.id, wt.amount, wt.currency, u.first_name, u.last_name
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
     WHERE wt.transaction_type = 'package_price_adjustment'
       AND wt.status = 'completed'
       AND wt.related_entity_type = 'customer_package'
       AND NOT EXISTS (SELECT 1 FROM customer_packages cp WHERE cp.id = wt.related_entity_id)
       AND EXISTS (
             SELECT 1 FROM wallet_transactions p
              WHERE p.related_entity_type = 'customer_package'
                AND p.related_entity_id = wt.related_entity_id
                AND p.status = 'completed'
                AND p.transaction_type IN ('package_purchase', 'package_refund'))
  `);
  if (skipped.length > 0) {
    console.log(`${skipped.length} orphaned adjustment(s) left alone (package refunded/still charged — netted by refund):`);
    for (const s of skipped) {
      console.log(`   ${s.first_name} ${s.last_name}: ${fmt(s.amount)} ${s.currency} (${s.id})`);
    }
    console.log('');
  }

  if (candidates.length === 0) {
    console.log('Nothing to repair: no orphaned package_price_adjustment rows on cascade-deleted packages.');
    process.exit(0);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${candidates.length} orphaned package_price_adjustment row(s)\n`);

  const wallets = new Map(); // `${userId}|${currency}` → { userId, currency, label }
  for (const row of candidates) {
    const who = `${row.first_name} ${row.last_name} <${row.email}>`;
    console.log(`── ${who}`);
    console.log(`   row      : ${row.id}`);
    console.log(`   package  : ${row.package_id} (deleted) — purchase/refund rows: ${row.sibling_rows || 'none'}`);
    console.log(`   amount   : ${fmt(row.amount)} ${row.currency} (available_delta ${fmt(row.available_delta)}) on ${new Date(row.transaction_date).toISOString().slice(0, 10)}`);
    console.log(`   desc     : ${row.description || ''}`);
    console.log(`   action   : status completed → cancelled`);
    wallets.set(`${row.user_id}|${row.currency}`, { userId: row.user_id, currency: row.currency, label: who });
  }

  const balanceOf = async (userId, currency) => {
    const { rows } = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    return rows[0]?.available_amount ?? 0;
  };

  console.log('\nWallet balances BEFORE:');
  for (const w of wallets.values()) {
    console.log(`   ${w.label} [${w.currency}]: ${fmt(await balanceOf(w.userId, w.currency))}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to repair.');
    process.exit(0);
  }

  await client.query('BEGIN');
  const cancellation = {
    cancelledAt: new Date().toISOString(),
    cancelledBy: null,
    cancellationOrigin: 'repair_orphaned_package_price_adjustments',
    cancellationReason: 'package was cascade-deleted; price adjustment outlived it'
  };
  const { rowCount } = await client.query(
    `UPDATE wallet_transactions
        SET status = 'cancelled',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW()
      WHERE id = ANY($2::uuid[])
        AND status = 'completed'`,
    [JSON.stringify(cancellation), candidates.map((r) => r.id)]
  );
  console.log(`\nCancelled ${rowCount} row(s).`);

  for (const w of wallets.values()) {
    const after = await recomputeBalanceFromLedger(w.userId, w.currency, { client });
    console.log(`   recomputed ${w.label} [${w.currency}]: ${fmt(after.available)}`);
  }
  await client.query('COMMIT');

  console.log('\nWallet balances AFTER:');
  for (const w of wallets.values()) {
    console.log(`   ${w.label} [${w.currency}]: ${fmt(await balanceOf(w.userId, w.currency))}`);
  }
  console.log('\nDone.');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* not in a transaction */ }
  console.error('Repair failed — rolled back:', error?.message || error);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
