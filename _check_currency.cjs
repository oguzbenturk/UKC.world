const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Check currency breakdown for manual_credit
  const curr = await pool.query(`
    SELECT currency, COUNT(*)::int as cnt, SUM(amount) as total, MIN(amount) as min_amt, MAX(amount) as max_amt
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY currency
    ORDER BY cnt DESC
  `);
  console.log('Currency breakdown:');
  curr.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} txns, total=${r.total}, range=${r.min_amt}-${r.max_amt}`));

  // Check big amounts - what currency are they?
  const big = await pool.query(`
    SELECT currency, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit' AND amount >= 10000
    GROUP BY currency
  `);
  console.log('\nBig amounts (>=10000):');
  big.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} txns, total=${r.total}`));

  // Small amounts - what currency?
  const small = await pool.query(`
    SELECT currency, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit' AND amount < 10000
    GROUP BY currency
  `);
  console.log('\nSmall amounts (<10000):');
  small.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} txns, total=${r.total}`));

  await pool.end();
}
main().catch(console.error);
