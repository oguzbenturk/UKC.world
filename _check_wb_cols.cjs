const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='wallet_balances' ORDER BY ordinal_position");
  console.log('wallet_balances columns:', r.rows.map(x => x.column_name));

  const sample = await pool.query("SELECT * FROM wallet_balances WHERE currency = 'TRY' LIMIT 2");
  console.log('Sample TRY rows:', sample.rows);

  await pool.end();
})();
