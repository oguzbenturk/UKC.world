const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // What transaction types exist and their counts/sums
  const types = await pool.query(`
    SELECT transaction_type, direction, count(*), 
           sum(amount) as total_amount,
           min(amount) as min_amt, max(amount) as max_amt
    FROM wallet_transactions 
    WHERE status != 'cancelled'
    GROUP BY transaction_type, direction
    ORDER BY count(*) DESC
  `);
  console.log('Transaction types breakdown:');
  console.table(types.rows);

  // How are the 1000 most recent distributed?
  const recent = await pool.query(`
    SELECT transaction_type, count(*), sum(amount) as total
    FROM wallet_transactions 
    WHERE status != 'cancelled'
      AND NOT (status = 'pending' AND available_delta = 0 AND payment_method = 'credit_card')
    ORDER BY transaction_date DESC, created_at DESC
    LIMIT 1000
  `);
  // Actually need to subquery
  const recent2 = await pool.query(`
    SELECT transaction_type, count(*), sum(amount) as total
    FROM (
      SELECT * FROM wallet_transactions 
      WHERE status != 'cancelled'
        AND NOT (status = 'pending' AND available_delta = 0 AND payment_method = 'credit_card')
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 1000
    ) sub
    GROUP BY transaction_type
    ORDER BY count(*) DESC
  `);
  console.log('\nMost recent 1000 transactions breakdown:');
  console.table(recent2.rows);

  // Total count
  const total = await pool.query(`
    SELECT count(*) FROM wallet_transactions 
    WHERE status != 'cancelled'
      AND NOT (status = 'pending' AND available_delta = 0 AND payment_method = 'credit_card')
  `);
  console.log('\nTotal eligible transactions:', total.rows[0].count);

  await pool.end();
})();
