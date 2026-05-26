// One-shot data fix: reverse the duplicate booking_charge_adjustment
// credit posted to Anıl Akay on shared group booking 7952747d.
//
// Context: on 2026-05-23 the group booking's price was edited from 224 to
// 180 EUR. Two code paths fired:
//   - routes/bookings.js (per-head share fan-out) credited +22 EUR to each
//     of the 2 participants (correct, sums to 44).
//   - services/bookingUpdateCascadeService.js (whole-booking) ALSO credited
//     the full 44 EUR delta to the primary participant (Anıl).
// Net result: Anıl was credited 22+44=66 for his share when he should have
// gotten 22, leaving a 44 EUR phantom credit.

import { pool } from './db.js';
import { recordTransaction } from './services/walletService.js';

const ANIL_USER_ID = 'c02c3643-4243-4d2f-ba78-2613a75d1b2b';
const BOOKING_ID = '7952747d-a5a0-458b-ada0-847938472c2f';
const DUPLICATE_TX_ID = '2a216aff-381a-4ea0-ba9e-057e1844e935';
const AMOUNT = 44;

const client = await pool.connect();
let exitCode = 0;
try {
  await client.query('BEGIN');

  // Verify the duplicate row matches what we expect before acting.
  const dup = await client.query(
    `SELECT id, user_id, booking_id, amount, direction, transaction_type, status
       FROM wallet_transactions WHERE id = $1`,
    [DUPLICATE_TX_ID]
  );
  if (!dup.rows.length) throw new Error('Original duplicate transaction not found — aborting');
  const d = dup.rows[0];
  if (d.user_id !== ANIL_USER_ID) throw new Error(`User mismatch: ${d.user_id}`);
  if (d.booking_id !== BOOKING_ID) throw new Error(`Booking mismatch: ${d.booking_id}`);
  if (Number(d.amount) !== AMOUNT) throw new Error(`Amount mismatch: ${d.amount}`);
  if (d.direction !== 'credit') throw new Error(`Direction mismatch: ${d.direction}`);
  if (d.transaction_type !== 'booking_charge_adjustment') throw new Error(`Type mismatch: ${d.transaction_type}`);

  // Guard against running twice.
  const existing = await client.query(
    `SELECT 1 FROM wallet_transactions
      WHERE user_id = $1 AND booking_id = $2
        AND transaction_type = 'booking_charge_adjustment'
        AND direction = 'debit'
        AND metadata->>'corrects' = $3`,
    [ANIL_USER_ID, BOOKING_ID, DUPLICATE_TX_ID]
  );
  if (existing.rows.length) {
    console.log('Correction already applied previously — nothing to do.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  const balBefore = await client.query(
    `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
    [ANIL_USER_ID, 'EUR']
  );
  console.log('Anıl wallet EUR balance BEFORE:', balBefore.rows[0]?.available_amount);

  const tx = await recordTransaction({
    client,
    userId: ANIL_USER_ID,
    amount: -AMOUNT,
    availableDelta: -AMOUNT,
    transactionType: 'booking_charge_adjustment',
    direction: 'debit',
    currency: 'EUR',
    status: 'completed',
    description: 'Correction: duplicate booking price-reduction credit removed',
    bookingId: BOOKING_ID,
    entityType: 'booking',
    relatedEntityType: 'booking',
    relatedEntityId: BOOKING_ID,
    metadata: {
      corrects: DUPLICATE_TX_ID,
      reason: 'manual_correction_double_credit',
      bookingId: BOOKING_ID,
    },
    allowNegative: true,
    createdBy: null,
  });

  console.log('Correction tx posted:', tx.id);

  const balAfter = await client.query(
    `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
    [ANIL_USER_ID, 'EUR']
  );
  console.log('Anıl wallet EUR balance AFTER:', balAfter.rows[0]?.available_amount);

  await client.query('COMMIT');
  console.log('COMMITTED');
} catch (e) {
  console.error('Error, rolling back:', e.message);
  await client.query('ROLLBACK');
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
