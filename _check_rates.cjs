const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Check exchange rate from currencies table
  const rates = await pool.query("SELECT currency_code, exchange_rate FROM currencies WHERE is_active = true ORDER BY currency_code");
  console.log('Active exchange rates:');
  rates.rows.forEach(r => console.log(`  ${r.currency_code}: ${r.exchange_rate}`));

  // Check exchange_rate and transaction_exchange_rate on wallet_transactions
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

  // Test conversion: what would TRY amounts look like in EUR?
  const tryToEur = await pool.query(`
    SELECT 
      SUM(CASE WHEN currency = 'EUR' THEN amount ELSE 0 END) as eur_total,
      SUM(CASE WHEN currency = 'TRY' THEN amount ELSE 0 END) as try_total,
      COUNT(CASE WHEN currency = 'EUR' THEN 1 END)::int as eur_cnt,
      COUNT(CASE WHEN currency = 'TRY' THEN 1 END)::int as try_cnt
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
  `);
  console.log('\nBreakdown:', JSON.stringify(tryToEur.rows[0]));

  await pool.end();
}
main().catch(console.error);
