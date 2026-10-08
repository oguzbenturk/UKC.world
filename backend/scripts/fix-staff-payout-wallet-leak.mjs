#!/usr/bin/env node
/**
 * One-off correction (2026-10-08): older staff payouts (wallet_transactions with
 * entity_type instructor_payment / manager_payment, type payment/deduction) were
 * written with a non-zero available_delta, so money already paid out ALSO sat in
 * the staff member's wallet as spendable credit. Staff must not have a spendable
 * wallet balance from payouts (owner, 2026-10-08) — their spendable money is
 * "earnings available" (staffEarningsService).
 *
 * For each instructor / manager whose CURRENT wallet balance equals the net
 * available_delta of their payout rows (everything else on the wallet nets to 0),
 * this writes one `payment_reversal` row taking that balance back to 0.
 *   - payment_reversal: excluded from revenue / refund stats ('_reversal' suffix)
 *   - entity_type 'instructor' / 'manager': not read by payroll, payout requests
 *     or earnings (they only read type payment/deduction with *_payment entities),
 *     so what the school owes each person does NOT change.
 * Users whose balance has any other source are skipped and listed.
 *
 * Usage (from backend/):  node scripts/fix-staff-payout-wallet-leak.mjs          # dry run
 *                         node scripts/fix-staff-payout-wallet-leak.mjs --apply  # write
 * Idempotent: each correction carries idempotency key staff-payout-wallet-leak:<user>:2026-10-08.
 */
import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { recordTransaction } from '../services/walletService.js';

const APPLY = process.argv.includes('--apply');
const RUN = '2026-10-08';

const { rows } = await pool.query(`
  WITH staff AS (
    SELECT u.id, u.name, r.name AS role
      FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
  ), payout AS (
    SELECT user_id, currency, SUM(COALESCE(available_delta, 0)) AS from_payouts
      FROM wallet_transactions
     WHERE entity_type IN ('instructor_payment', 'manager_payment')
       AND transaction_type IN ('payment', 'deduction')
       AND status <> 'cancelled'
     GROUP BY 1, 2
  ), other AS (
    SELECT user_id, currency, SUM(COALESCE(available_delta, 0)) AS from_other
      FROM wallet_transactions
     WHERE NOT (entity_type IN ('instructor_payment', 'manager_payment')
                AND transaction_type IN ('payment', 'deduction'))
       AND status <> 'cancelled'
     GROUP BY 1, 2
  )
  SELECT s.id, s.name, s.role, wb.currency, wb.available_amount,
         COALESCE(p.from_payouts, 0) AS from_payouts, COALESCE(o.from_other, 0) AS from_other
    FROM staff s
    JOIN wallet_balances wb ON wb.user_id = s.id
    LEFT JOIN payout p ON p.user_id = s.id AND p.currency = wb.currency
    LEFT JOIN other o ON o.user_id = s.id AND o.currency = wb.currency
   WHERE wb.available_amount <> 0
   ORDER BY s.role, s.name
`);

const fixes = [];
const skipped = [];
for (const r of rows) {
  const balance = new Decimal(r.available_amount);
  const fromPayouts = new Decimal(r.from_payouts);
  const fromOther = new Decimal(r.from_other);
  if (fromOther.isZero() && balance.equals(fromPayouts) && balance.gt(0)) {
    fixes.push({ ...r, amount: balance });
  } else {
    skipped.push({ name: r.name, role: r.role, balance: balance.toFixed(2), fromPayouts: fromPayouts.toFixed(2), fromOther: fromOther.toFixed(2) });
  }
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${fixes.length} correction(s), ${skipped.length} skipped`);
console.table(fixes.map((f) => ({ name: f.name, role: f.role, currency: f.currency, balance: f.amount.toFixed(2), correction: f.amount.negated().toFixed(2) })));
if (skipped.length) {
  console.log('Skipped (balance has other sources — check by hand):');
  console.table(skipped);
}

if (APPLY) {
  for (const f of fixes) {
    const amount = f.amount.negated().toNumber();
    await recordTransaction({
      userId: f.id,
      amount,
      transactionType: 'payment_reversal',
      currency: f.currency,
      direction: 'debit',
      availableDelta: amount,
      entityType: f.role === 'manager' ? 'manager' : 'instructor',
      description: 'Correction: payouts were also credited to the wallet (already paid out)',
      metadata: { origin: 'staff-payout-wallet-leak-correction', run: RUN, previousBalance: f.amount.toFixed(2) },
      idempotencyKey: `staff-payout-wallet-leak:${f.id}:${RUN}`,
    });
    console.log(`  ✓ ${f.name}: ${f.amount.toFixed(2)} ${f.currency} → 0`);
  }
}

await pool.end();
process.exit(0);
