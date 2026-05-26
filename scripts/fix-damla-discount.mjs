// One-shot data fix: reverse Damla Henden's orphaned package discount.
//
// Context: customer_package 8987abac-d83d-4b8d-a3be-a93bb639bf75 was
// force-deleted but the +140 EUR discount_adjustment was never reversed,
// leaving a phantom credit on her wallet (hidden from her financial
// history view because the filter excludes ledger rows whose
// customer_package is gone). See discountService.deleteDiscount.

import { pool } from './db.js';
import { deleteDiscount } from './services/discountService.js';

const DISCOUNT_ID = 19;
const EXPECTED_AMOUNT = 140;
const EXPECTED_CUSTOMER_ID = 'db48fb05-a7ba-45f4-82dd-ace021a3a50a';
const EXPECTED_ENTITY_ID = '8987abac-d83d-4b8d-a3be-a93bb639bf75';

const client = await pool.connect();
let exitCode = 0;
try {
  await client.query('BEGIN');

  const before = await client.query(
    `SELECT id, customer_id, entity_type, entity_id, amount, currency
       FROM discounts WHERE id = $1 FOR UPDATE`,
    [DISCOUNT_ID]
  );
  if (!before.rows.length) {
    console.error(`Discount ${DISCOUNT_ID} not found — already removed?`);
    await client.query('ROLLBACK');
    process.exit(2);
  }
  const d = before.rows[0];
  console.log('Found discount:', JSON.stringify(d));
  if (d.customer_id !== EXPECTED_CUSTOMER_ID) {
    console.error('Customer mismatch — refusing to act');
    await client.query('ROLLBACK');
    process.exit(3);
  }
  if (Number(d.amount) !== EXPECTED_AMOUNT) {
    console.error(`Amount mismatch — expected ${EXPECTED_AMOUNT} got ${d.amount}`);
    await client.query('ROLLBACK');
    process.exit(4);
  }
  if (d.entity_type !== 'customer_package' || d.entity_id !== EXPECTED_ENTITY_ID) {
    console.error('Entity mismatch — refusing to act');
    await client.query('ROLLBACK');
    process.exit(5);
  }

  const balBefore = await client.query(
    `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
    [EXPECTED_CUSTOMER_ID, 'EUR']
  );
  console.log('Wallet EUR balance BEFORE:', balBefore.rows[0]?.available_amount);

  const removed = await deleteDiscount(client, DISCOUNT_ID, { createdBy: null });
  console.log('deleteDiscount returned:', removed);

  const balAfter = await client.query(
    `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
    [EXPECTED_CUSTOMER_ID, 'EUR']
  );
  console.log('Wallet EUR balance AFTER:', balAfter.rows[0]?.available_amount);

  const reversal = await client.query(
    `SELECT id, transaction_type, direction, amount, description, metadata
       FROM wallet_transactions
      WHERE user_id = $1 AND transaction_type = 'discount_adjustment_reversal'
        AND metadata->>'discount_id' = $2
      ORDER BY created_at DESC LIMIT 1`,
    [EXPECTED_CUSTOMER_ID, String(DISCOUNT_ID)]
  );
  console.log('Reversal row:', JSON.stringify(reversal.rows[0] || null));

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
