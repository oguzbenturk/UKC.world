const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Find the currencies table name
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%currenc%' AND table_schema = 'public'");
  console.log('Currency tables:', tables.rows.map(r => r.table_name));

  // If none, check for exchange rate config
  const settings = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%setting%' OR table_name LIKE '%config%' OR table_name LIKE '%rate%' AND table_schema = 'public'");
  console.log('Settings/config tables:', settings.rows.map(r => r.table_name));

  // Check exchange_rate on wallet_transactions directly
  const txRates = await pool.query(`
    SELECT currency, 
      COUNT(*)::int as cnt,
      MIN(exchange_rate) as min_er, MAX(exchange_rate) as max_er,
      MIN(transaction_exchange_rate) as min_ter, MAX(transaction_exchange_rate) as max_ter
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY currency
  `);
  console.log('\nTransaction exchange rates:');
  txRates.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} txns, exchange_rate=${r.min_er}-${r.max_er}, tx_exchange_rate=${r.min_ter}-${r.max_ter}`));

  await pool.end();
}
main().catch(console.error);
