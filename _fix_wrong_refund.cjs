const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

const USER_ID = '21764418-1ab1-482b-9b60-5332ee919e91';
const WRONG_REFUND_TXN_ID = '0090d0ea-35ca-493a-b81e-4180967ef9e5';
const WRONG_REFUND_AMOUNT = 35837.90;
const GROUP_BOOKING_ID = '0fd8ad46-6233-4b46-b71d-eaae491faadc';
const GROUP_PAYMENT_AMOUNT = 14335.16; // What she paid; refund is +this
const EXPECTED_FINAL_BALANCE = 55738.53;

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Reverse the wrong refund transaction
    await client.query(
      `UPDATE wallet_transactions SET status = 'reversed', available_delta = 0, description = description || ' [REVERSED: wrong package refunded]' WHERE id = $1`,
      [WRONG_REFUND_TXN_ID]
    );
    console.log('Step 1: Reversed wrong refund transaction');

    // 2. Reduce wallet balance by the wrong refund amount
    await client.query(
      `UPDATE wallet_balances SET available_amount = available_amount - $1 WHERE user_id = $2 AND currency = 'TRY'`,
      [WRONG_REFUND_AMOUNT, USER_ID]
    );
    console.log(`Step 2: Reduced wallet by ${WRONG_REFUND_AMOUNT} TRY`);

    // 3. Insert correct refund for the 6h group pack payment
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, available_delta, direction, status, description, currency, related_entity_id, related_entity_type, transaction_date)
       VALUES (gen_random_uuid(), $1, 'payment_refund', $2, $2, 'credit', 'completed',
               'Group Lesson Refund (Admin): 6Hours-Group Starter Pack', 'TRY', $3, 'group_booking', NOW())`,
      [USER_ID, GROUP_PAYMENT_AMOUNT, GROUP_BOOKING_ID]
    );
    console.log(`Step 3: Inserted correct refund of +${GROUP_PAYMENT_AMOUNT} TRY for 6h group pack`);

    // 4. Increase wallet balance by correct refund amount
    await client.query(
      `UPDATE wallet_balances SET available_amount = available_amount + $1 WHERE user_id = $2 AND currency = 'TRY'`,
      [GROUP_PAYMENT_AMOUNT, USER_ID]
    );
    console.log(`Step 4: Increased wallet by ${GROUP_PAYMENT_AMOUNT} TRY`);

    // Verify final balance
    const balRes = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = 'TRY'`,
      [USER_ID]
    );
    const finalBalance = parseFloat(balRes.rows[0].available_amount);
    console.log(`\nFinal balance: ${finalBalance} TRY`);
    console.log(`Expected:      ${EXPECTED_FINAL_BALANCE} TRY`);

    if (Math.abs(finalBalance - EXPECTED_FINAL_BALANCE) > 0.02) {
      throw new Error(`Balance mismatch! Got ${finalBalance}, expected ${EXPECTED_FINAL_BALANCE}`);
    }

    await client.query('COMMIT');
    console.log('\n✓ All done — committed');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
