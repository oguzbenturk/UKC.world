const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // Most recent 1000 breakdown
  const recent = await pool.query(`
    SELECT transaction_type, direction, count(*) as cnt, sum(amount) as total
    FROM (
      SELECT transaction_type, direction, amount
      FROM wallet_transactions 
      WHERE status != 'cancelled'
        AND NOT (status = 'pending' AND available_delta = 0 AND payment_method = 'credit_card')
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 1000
    ) sub
    GROUP BY transaction_type, direction
    ORDER BY cnt DESC
  `);
  console.log('Most recent 1000 transactions:');
  console.table(recent.rows);

  // Check how resolveWalletAmount would transform them
  const CREDIT = new Set(['payment', 'credit', 'refund', 'booking_deleted_refund', 'package_refund']);
  const DEBIT = new Set(['charge', 'debit', 'service_payment', 'rental_payment', 'package_purchase']);

  let totalIncome = 0;
  let totalCharges = 0;
  for (const row of recent.rows) {
    const rawTotal = parseFloat(row.total);
    const count = parseInt(row.cnt);
    // Approximate: resolve each type
    if (CREDIT.has(row.transaction_type)) {
      // Each amount forced positive
      totalIncome += Math.abs(rawTotal);
    } else if (DEBIT.has(row.transaction_type)) {
      // Each amount forced negative
      totalCharges += Math.abs(rawTotal);
    } else {
      // Raw: positive = income, negative = charges
      if (rawTotal > 0) totalIncome += rawTotal;
      else totalCharges += Math.abs(rawTotal);
    }
  }
  console.log('\nWith resolveWalletAmount classification:');
  console.log('Total Income:', totalIncome.toFixed(2));
  console.log('Total Charges:', totalCharges.toFixed(2));
  console.log('Net:', (totalIncome - totalCharges).toFixed(2));

  await pool.end();
})();
