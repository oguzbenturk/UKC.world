const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  const r = await pool.query(`
    SELECT 'wallet_transactions' as tbl, count(*) FROM wallet_transactions WHERE currency = 'TRY'
    UNION ALL
    SELECT 'wallet_balances', count(*) FROM wallet_balances WHERE currency = 'TRY'
  `);
  console.log('Remaining TRY records:', r.rows);

  const currencies = await pool.query(`
    SELECT 'wallet_transactions' as tbl, currency, count(*) FROM wallet_transactions GROUP BY currency
    UNION ALL
    SELECT 'wallet_balances', currency, count(*) FROM wallet_balances GROUP BY currency
  `);
  console.log('All currencies:', currencies.rows);

  await pool.end();
})();
