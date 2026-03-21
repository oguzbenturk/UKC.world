const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Schema
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'wallet_transactions' ORDER BY ordinal_position");
  console.log('wallet_transactions columns:');
  cols.rows.forEach(r => console.log('  ' + r.column_name + ': ' + r.data_type));

  // Sample manual_credit records
  const sample = await pool.query("SELECT id, user_id, amount, currency, transaction_type, status, description, created_at FROM wallet_transactions WHERE transaction_type = 'manual_credit' ORDER BY created_at DESC LIMIT 5");
  console.log('\nSample manual_credit transactions:');
  sample.rows.forEach(r => console.log(JSON.stringify(r)));

  // Stats by month (last 6 months)
  const monthly = await pool.query("SELECT DATE_TRUNC('month', created_at) as month, COUNT(*)::int as cnt, SUM(amount) as total FROM wallet_transactions WHERE transaction_type = 'manual_credit' GROUP BY month ORDER BY month DESC LIMIT 6");
  console.log('\nMonthly manual_credit stats:');
  monthly.rows.forEach(r => console.log(JSON.stringify(r)));

  // Total stats
  const stats = await pool.query("SELECT COUNT(*)::int as total_count, SUM(amount) as total_amount, COUNT(DISTINCT user_id)::int as unique_users FROM wallet_transactions WHERE transaction_type = 'manual_credit'");
  console.log('\nOverall stats:', JSON.stringify(stats.rows[0]));

  // Also check 'payment' type (these might be wallet loads)
  const payments = await pool.query("SELECT id, user_id, amount, currency, transaction_type, status, description, created_at FROM wallet_transactions WHERE transaction_type = 'payment' ORDER BY created_at DESC LIMIT 3");
  console.log('\nSample payment transactions:');
  payments.rows.forEach(r => console.log(JSON.stringify(r)));

  await pool.end();
}
main().catch(console.error);
