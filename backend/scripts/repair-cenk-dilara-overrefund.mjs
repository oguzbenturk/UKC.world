// One-shot data fix: claw back the €6 phantom wallet credits that two
// discounted "Beach Facilities" memberships left on Cenk Kaska and Dilara İnce
// when they were DELETED before the over-refund bug was fixed.
//
// Bug (now fixed in code — see getEntityNetCharges COALESCE + discountService):
// a €12 membership at 50% off is charged €6 net (payment -12 + discount +6), but
// deleting it refunded the GROSS €12 instead of the €6 net, leaving a +€6 windfall.
//   - Cenk  : deleted member_purchase #75  → +€6 phantom
//   - Dilara: deleted member_purchase #76  → +€6 phantom
//
// This posts a -€6 EUR `manual_debit` to each (the same path the admin
// "manual adjust" endpoint uses), with allowNegative so Dilara's wallet may go
// negative, and an idempotencyKey so re-running (local dry-run THEN prod) is a
// no-op. recordTransaction updates wallet_balances + writes the audit log.
//
// Expected AFTER (EUR available_amount):
//   Cenk   +15.38 → +9.38   (true prepaid credit)
//   Dilara  -3.38 → -9.38   (net with her +180 TRY ≈ +€3.38 ⇒ -€6.00 owed)
//
// Usage (runs against whatever DATABASE_URL backend/.env points to):
//   node backend/scripts/repair-cenk-dilara-overrefund.mjs

import { pool } from '../db.js';
import { recordTransaction, getBalance } from '../services/walletService.js';

// expectedBefore = the un-corrected EUR available_amount this script assumes.
// If the live balance is neither this NOR the already-corrected value, the
// account is in an unexpected state (someone else changed it) — abort rather
// than blindly subtract another €6.
const CORRECTIONS = [
  { name: 'Cenk Kaska',  userId: '0c66214b-4734-46bd-96ae-1413f081788e', memberPurchaseId: 75, amount: 6, expectedBefore: 15.38 },
  { name: 'Dilara İnce', userId: '0a5b25aa-1c01-4f11-953d-b6ee39b40a70', memberPurchaseId: 76, amount: 6, expectedBefore: -3.38 },
];

const fmt = (v) => Number(v).toFixed(2);
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
let exitCode = 0;

try {
  // Pre-flight guard: every account must be either un-corrected (expectedBefore)
  // or already-corrected (expectedBefore - amount). Anything else → abort all.
  for (const c of CORRECTIONS) {
    const { available } = await getBalance(c.userId, 'EUR');
    const corrected = c.expectedBefore - c.amount;
    if (!near(available, c.expectedBefore) && !near(available, corrected)) {
      throw new Error(
        `${c.name}: EUR balance ${fmt(available)} is neither expected ${fmt(c.expectedBefore)} ` +
        `nor already-corrected ${fmt(corrected)} — aborting (unexpected state, investigate).`
      );
    }
  }

  for (const c of CORRECTIONS) {
    const before = await getBalance(c.userId, 'EUR');
    const tx = await recordTransaction({
      userId: c.userId,
      amount: -c.amount,
      transactionType: 'manual_debit',
      currency: 'EUR',
      status: 'completed',
      description: 'Correction: over-refund on deleted 50%-off membership (refunded gross €12, only €6 net was charged)',
      metadata: {
        reason: 'overrefund_correction_discounted_membership',
        correctsMemberPurchase: c.memberPurchaseId,
      },
      // Stable key → re-running this script never double-applies the claw-back.
      idempotencyKey: `overrefund-correction:member_purchase:${c.memberPurchaseId}`,
      allowNegative: true,
      createdBy: null,
    });
    const after = await getBalance(c.userId, 'EUR');
    const reused = Number(before.available) === Number(after.available);
    console.log(
      `${c.name.padEnd(12)} EUR ${fmt(before.available)} → ${fmt(after.available)}` +
      `  (tx ${tx.id}${reused ? ', already applied — no-op' : ''})`
    );
  }

  // Invariant: cached wallet_balances.available_amount must equal the sum of
  // completed ledger deltas for each corrected EUR wallet.
  const ids = CORRECTIONS.map((c) => c.userId);
  const { rows } = await pool.query(
    `SELECT b.user_id,
            b.available_amount AS cached,
            COALESCE(l.ledger, 0) AS ledger,
            ROUND((b.available_amount - COALESCE(l.ledger, 0))::numeric, 4) AS drift
       FROM wallet_balances b
       LEFT JOIN (
         SELECT user_id, SUM(available_delta) AS ledger
           FROM wallet_transactions
          WHERE status = 'completed' AND currency = 'EUR'
          GROUP BY user_id
       ) l ON l.user_id = b.user_id
      WHERE b.user_id = ANY($1) AND b.currency = 'EUR'`,
    [ids]
  );
  console.log('\nInvariant check (cached vs ledger):');
  for (const r of rows) {
    const ok = Math.abs(Number(r.drift)) < 0.005;
    console.log(`  ${r.user_id}  cached=${fmt(r.cached)} ledger=${fmt(r.ledger)} drift=${r.drift} ${ok ? 'OK' : 'MISMATCH'}`);
    if (!ok) exitCode = 1;
  }
  if (exitCode) console.error('\n❌ Invariant mismatch — investigate before trusting balances.');
  else console.log('\n✅ Corrections applied; invariant holds.');
} catch (e) {
  console.error('Error:', e.message);
  exitCode = 1;
} finally {
  await pool.end();
  process.exit(exitCode);
}
