const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Check amount distribution for manual_credit
  const dist = await pool.query(`
    SELECT 
      CASE 
        WHEN amount <= 100 THEN '0-100'
        WHEN amount <= 500 THEN '101-500'
        WHEN amount <= 1000 THEN '501-1000'
        WHEN amount <= 5000 THEN '1001-5000'
        WHEN amount <= 10000 THEN '5001-10000'
        ELSE '10000+'
      END as range,
      COUNT(*)::int as cnt,
      MIN(amount) as min_amt,
      MAX(amount) as max_amt,
      ROUND(AVG(amount), 2) as avg_amt
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY range
    ORDER BY MIN(amount)
  `);
  console.log('Amount distribution:');
  dist.rows.forEach(r => console.log(`  ${r.range}: ${r.cnt} txns, min=${r.min_amt}, max=${r.max_amt}, avg=${r.avg_amt}`));

  // Check descriptions to understand what these are
  const descs = await pool.query(`
    SELECT description, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY description
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('\nDescriptions:');
  descs.rows.forEach(r => console.log(`  "${r.description}": ${r.cnt} txns, total=${r.total}`));

  // Check who created these - admin bulk seed or individual?
  const creators = await pool.query(`
    SELECT cb.name as creator, COUNT(*)::int as cnt
    FROM wallet_transactions wt
    LEFT JOIN users cb ON cb.id = wt.created_by
    WHERE wt.transaction_type = 'manual_credit'
    GROUP BY cb.name
    ORDER BY cnt DESC
  `);
  console.log('\nCreated by:');
  creators.rows.forEach(r => console.log(`  ${r.creator}: ${r.cnt}`));

  // Check the big depositors - what did Kamil get?
  const kamil = await pool.query(`
    SELECT wt.amount, wt.description, wt.created_at, wt.transaction_type
    FROM wallet_transactions wt
    JOIN users u ON u.id = wt.user_id
    WHERE u.name LIKE '%Kamil%' AND wt.transaction_type = 'manual_credit'
    ORDER BY wt.created_at
  `);
  console.log('\nKamil deposits:');
  kamil.rows.forEach(r => console.log(`  ${r.amount} - ${r.description} (${r.created_at})`));

  // What other transaction types exist that could be deposits?
  const types = await pool.query(`
    SELECT transaction_type, direction, COUNT(*)::int as cnt, SUM(amount) as total
    FROM wallet_transactions
    GROUP BY transaction_type, direction
    ORDER BY cnt DESC
  `);
  console.log('\nAll transaction types with direction:');
  types.rows.forEach(r => console.log(`  ${r.transaction_type} (${r.direction}): ${r.cnt} txns, total=${r.total}`));

  await pool.end();
}
main().catch(console.error);
