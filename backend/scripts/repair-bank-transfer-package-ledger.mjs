// Data repair for the bank-transfer package purchase ledger (found 2026-08-30,
// customer Diederik Visser — the first real self-service bank transfer in prod).
//
// THE DISEASE (two bugs, one ledger)
//
// A) NO RECEIVABLE. A student self-purchasing a package by bank transfer got a
//    `package_purchase` charge written with available_delta = 0 ("payment is
//    external", services.js) — but the money had NOT arrived yet, it was waiting
//    for the admin to approve the receipt. The debt therefore never existed in
//    wallet_balances. When staff later recorded what the customer actually paid
//    (Add Funds → real credit), the balance drifted POSITIVE by exactly the
//    unpaid remainder: €400 of phantom store credit on a fully-paid package.
//    Staff-created packages have always posted a real debit — the two paths
//    disagreed about what a package purchase means.
//
// B) DUPLICATE CHARGE. The receipt approval (bookings.js) wrote a SECOND
//    `package_purchase` debit for the RECEIPT amount on top of the charge that
//    already existed — so a 20%-deposit receipt on a €500 package booked €600 of
//    package revenue in the finance reports.
//
// Both are fixed in code (services.js + bookings.js, same commit). This script
// repairs the rows those bugs already wrote:
//
//   1. self-purchase bank_transfer charge   available_delta 0 → amount (receivable)
//   2. duplicate approval charge            status → 'cancelled' (cancel-only, no
//                                           reversal row — see wiki Finances_Wallet)
//   3. approval payment credit              available_delta 0 → amount, and untagged
//                                           from the package (a package-tagged credit
//                                           cancels the charge in getEntityNetCharges,
//                                           so deleting the package would refund the
//                                           customer nothing)
//   4. recompute wallet_balances from the completed ledger
//
// Idempotent: a second run finds nothing to change and the recompute is a no-op.
//
// Usage (runs against whatever backend/.env points to):
//   node backend/scripts/repair-bank-transfer-package-ledger.mjs           # dry run
//   node backend/scripts/repair-bank-transfer-package-ledger.mjs --apply   # write

import { pool } from '../db.js';
import { recomputeBalanceFromLedger } from '../services/walletService.js';

const APPLY = process.argv.includes('--apply');
const fmt = (v) => Number(v ?? 0).toFixed(2);

const client = await pool.connect();
let exitCode = 0;

try {
  // Every self-purchase bank-transfer package charge that never debited the wallet.
  const { rows: charges } = await client.query(`
    SELECT wt.id, wt.user_id, wt.currency, wt.amount, wt.available_delta,
           wt.related_entity_id AS package_id, wt.transaction_date,
           u.first_name, u.last_name, u.email,
           cp.package_name, cp.purchase_price, cp.status AS package_status
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      LEFT JOIN customer_packages cp ON cp.id = wt.related_entity_id
     WHERE wt.transaction_type = 'package_purchase'
       AND wt.status = 'completed'
       AND wt.metadata->>'source' = 'services:packages:self-purchase'
       AND wt.payment_method = 'bank_transfer'
       AND wt.available_delta = 0
       AND wt.related_entity_type = 'customer_package'
     ORDER BY wt.transaction_date
  `);

  if (charges.length === 0) {
    console.log('Nothing to repair: no zero-delta self-purchase bank-transfer package charges found.');
    process.exit(0);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${charges.length} package charge(s) to repair\n`);

  const wallets = new Map(); // `${userId}|${currency}` → { userId, currency, label }

  for (const charge of charges) {
    const who = `${charge.first_name} ${charge.last_name} <${charge.email}>`;
    console.log(`── ${who}`);
    console.log(`   package : ${charge.package_name || '(deleted)'} (${charge.package_id}) status=${charge.package_status || '-'} price=${fmt(charge.purchase_price)}`);
    console.log(`   [1] charge ${charge.id} ${fmt(charge.amount)} ${charge.currency} — available_delta 0.00 → ${fmt(charge.amount)}`);

    // The approval's duplicate charge + the payment credit(s) for this package.
    const { rows: approvalRows } = await client.query(`
      SELECT id, transaction_type, amount, available_delta, related_entity_type, status
        FROM wallet_transactions
       WHERE related_entity_type = 'customer_package'
         AND related_entity_id = $1
         AND status = 'completed'
         AND metadata->>'source' = 'bank_transfer_approval'
       ORDER BY created_at
    `, [charge.package_id]);

    const dupCharges = approvalRows.filter((r) => r.transaction_type === 'package_purchase');
    const payments = approvalRows.filter((r) => r.transaction_type === 'bank_transfer_payment');

    for (const dup of dupCharges) {
      console.log(`   [2] duplicate approval charge ${dup.id} ${fmt(dup.amount)} → status 'cancelled'`);
    }
    for (const pay of payments) {
      console.log(`   [3] payment credit ${pay.id} ${fmt(pay.amount)} — available_delta ${fmt(pay.available_delta)} → ${fmt(pay.amount)}, untag from package`);
    }

    const { rows: [before] } = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [charge.user_id, charge.currency]
    );
    const expected =
      Number(before?.available_amount ?? 0) +
      Number(charge.amount) +
      payments.reduce((sum, p) => sum + (Number(p.amount) - Number(p.available_delta)), 0);
    console.log(`   balance : ${fmt(before?.available_amount)} → ${fmt(expected)} ${charge.currency} (expected)\n`);

    if (APPLY) {
      await client.query('BEGIN');
      // A repaired wallet may legitimately sit negative (unpaid remainder still due).
      await client.query(`SELECT set_config('wallet.allow_negative', 'true', false)`);

      await client.query(`
        UPDATE wallet_transactions
           SET available_delta = amount,
               metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                 'repaired', 'bank_transfer_package_receivable',
                 'repairedAt', NOW()::text,
                 'previousAvailableDelta', 0),
               updated_at = NOW()
         WHERE id = $1 AND available_delta = 0
      `, [charge.id]);

      for (const dup of dupCharges) {
        await client.query(`
          UPDATE wallet_transactions
             SET status = 'cancelled',
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'cancellationOrigin', 'repair_bank_transfer_duplicate_package_charge',
                   'cancelledAt', NOW()::text),
                 updated_at = NOW()
           WHERE id = $1 AND status = 'completed'
        `, [dup.id]);
      }

      for (const pay of payments) {
        await client.query(`
          UPDATE wallet_transactions
             SET available_delta = amount,
                 related_entity_type = NULL,
                 related_entity_id = NULL,
                 entity_type = NULL,
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'packageId', $2::text,
                   'paidBy', user_id::text,
                   'repaired', 'bank_transfer_payment_credit',
                   'repairedAt', NOW()::text),
                 updated_at = NOW()
           WHERE id = $1 AND available_delta = 0
        `, [pay.id, charge.package_id]);
      }

      await client.query('COMMIT');
      wallets.set(`${charge.user_id}|${charge.currency}`, { userId: charge.user_id, currency: charge.currency, label: who });
    }
  }

  if (!APPLY) {
    console.log('Dry run only — nothing written. Re-run with --apply to repair.');
    process.exit(0);
  }

  for (const { userId, currency, label } of wallets.values()) {
    await client.query(`SELECT set_config('wallet.allow_negative', 'true', false)`);
    await recomputeBalanceFromLedger(userId, currency);
    const { rows: [after] } = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    console.log(`recomputed ${label} → ${fmt(after?.available_amount)} ${currency}`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Repair failed:', err.message);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
