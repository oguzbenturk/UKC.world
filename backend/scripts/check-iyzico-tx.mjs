import { pool } from '../db.js';

async function main() {
  try {
    // Fix the wrong refund transaction - should be negative
    const refundTxId = '48db622a-f1c7-43d9-aaa8-4834b25183f1';
    const userId = 'e98154ce-22a5-46c5-909f-03e78a7eba26';
    const currency = 'EUR';
    
    // The transaction was already updated to -250, now fix the balance
    // Original deposit was +250, wrong refund added +250 (total +500)
    // Should have been: +250 deposit, -250 refund = 0
    // Current balance is +500, needs to be 0, so subtract 500
    const correction = -500;
    
    await pool.query(
      `UPDATE wallet_balances SET available_amount = available_amount + $1 WHERE user_id = $2 AND currency = $3`,
      [correction, userId, currency]
    );
    console.log('Corrected wallet balance by:', correction);
    
    // Verify
    const balance = await pool.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [userId, currency]
    );
    console.log('New balance:', balance.rows[0]?.available_amount);
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

main();
