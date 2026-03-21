const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  const dr = await pool.query('SELECT COUNT(*)::int as cnt FROM wallet_deposit_requests');
  console.log('deposit_requests:', dr.rows[0].cnt);

  const wt = await pool.query('SELECT transaction_type, COUNT(*)::int as cnt FROM wallet_transactions GROUP BY transaction_type ORDER BY cnt DESC');
  console.log('\ntransaction types:');
  wt.rows.forEach(r => console.log('  ' + r.transaction_type + ': ' + r.cnt));

  const dep = await pool.query("SELECT COUNT(*)::int as cnt, COALESCE(SUM(ABS(amount)), 0) as total FROM wallet_transactions WHERE transaction_type = 'wallet_deposit'");
  console.log('\nwallet_deposits:', dep.rows[0]);

  const sample = await pool.query("SELECT id, user_id, amount, transaction_type, status, created_at FROM wallet_transactions WHERE transaction_type LIKE '%deposit%' ORDER BY created_at DESC LIMIT 3");
  console.log('\nsamples:');
  sample.rows.forEach(r => console.log('  ' + JSON.stringify(r)));

  await pool.end();
}
main().catch(console.error);
