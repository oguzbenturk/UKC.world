const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // 1. All TRY data in wallet_transactions
  const tryTxns = await pool.query(`
    SELECT transaction_type, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions 
    WHERE currency = 'TRY'
    GROUP BY transaction_type
    ORDER BY cnt DESC
  `);
  console.log('TRY wallet_transactions by type:');
  tryTxns.rows.forEach(r => console.log(`  ${r.transaction_type}: ${r.cnt} txns, total=${r.total}`));

  // 2. Check shop/order tables for TRY
  const tables = ['orders', 'order_items', 'shop_products'];
  for (const t of tables) {
    try {
      const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' AND column_name LIKE '%curr%'`);
      if (cols.rows.length > 0) {
        const colName = cols.rows[0].column_name;
        const tryCnt = await pool.query(`SELECT COUNT(*)::int as cnt FROM ${t} WHERE ${colName} = 'TRY'`);
        const eurCnt = await pool.query(`SELECT COUNT(*)::int as cnt FROM ${t} WHERE ${colName} = 'EUR'`);
        console.log(`\n${t}.${colName}: EUR=${eurCnt.rows[0].cnt}, TRY=${tryCnt.rows[0].cnt}`);
      } else {
        console.log(`\n${t}: no currency column`);
      }
    } catch (e) {
      console.log(`\n${t}: ${e.message.split('\n')[0]}`);
    }
  }

  // 3. Check all tables with currency columns for TRY data
  const allCurrCols = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND (column_name = 'currency' OR column_name = 'currency_code')
    ORDER BY table_name
  `);
  console.log('\nAll tables with currency columns:');
  for (const r of allCurrCols.rows) {
    try {
      const tryCnt = await pool.query(`SELECT COUNT(*)::int as cnt FROM "${r.table_name}" WHERE "${r.column_name}" = 'TRY'`);
      if (tryCnt.rows[0].cnt > 0) {
        console.log(`  ${r.table_name}.${r.column_name}: ${tryCnt.rows[0].cnt} TRY records`);
      }
    } catch (e) {
      // skip
    }
  }

  // 4. Specifically check payment transactions (from screenshot)
  const payments = await pool.query(`
    SELECT currency, COUNT(*)::int as cnt, SUM(amount) as total, MIN(amount) as min_amt, MAX(amount) as max_amt
    FROM wallet_transactions 
    WHERE transaction_type = 'payment'
    GROUP BY currency
  `);
  console.log('\nPayment transactions by currency:');
  payments.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} txns, total=${r.total}, range=${r.min_amt} to ${r.max_amt}`));

  // 5. Check sample TRY payment
  const sample = await pool.query(`
    SELECT id, amount, currency, description, created_at
    FROM wallet_transactions 
    WHERE transaction_type = 'payment' AND currency = 'TRY'
    LIMIT 3
  `);
  console.log('\nSample TRY payments:');
  sample.rows.forEach(r => console.log(`  ${r.currency} ${r.amount} - ${r.description}`));

  // 6. Also check booking/rental charges
  const charges = await pool.query(`
    SELECT transaction_type, currency, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions
    WHERE currency = 'TRY'
    GROUP BY transaction_type, currency
    ORDER BY cnt DESC
  `);
  console.log('\nALL TRY transactions:');
  charges.rows.forEach(r => console.log(`  ${r.transaction_type}: ${r.cnt} txns, total=${r.total}`));

  await pool.end();
}
main().catch(console.error);
