const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // 1. Per-user deposit totals - do users have multiple deposits?
  const perUser = await pool.query(`
    SELECT user_id, COUNT(*)::int as txn_count, 
      SUM(amount) as raw_total, 
      STRING_AGG(DISTINCT currency, ',') as currencies,
      STRING_AGG(amount::text, ', ' ORDER BY created_at) as amounts
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY user_id
    HAVING COUNT(*) > 1
    LIMIT 10
  `);
  console.log('Users with MULTIPLE deposits:', perUser.rows.length, 'of 1900');
  perUser.rows.slice(0, 5).forEach(r => console.log(`  user=${r.user_id.slice(0,8)} txns=${r.txn_count} currencies=${r.currencies} amounts=[${r.amounts}]`));

  // 2. Distribution of per-user totals
  const dist = await pool.query(`
    SELECT txn_count, COUNT(*)::int as user_count FROM (
      SELECT user_id, COUNT(*)::int as txn_count
      FROM wallet_transactions WHERE transaction_type = 'manual_credit'
      GROUP BY user_id
    ) sub GROUP BY txn_count ORDER BY txn_count
  `);
  console.log('\nDeposits-per-user distribution:');
  dist.rows.forEach(r => console.log(`  ${r.txn_count} deposits: ${r.user_count} users`));

  // 3. EUR-only breakdown (since user says everyone should be 5000 EUR)
  const eurOnly = await pool.query(`
    SELECT 
      COUNT(*)::int as cnt, 
      MIN(amount) as min_amt, MAX(amount) as max_amt, ROUND(AVG(amount), 2) as avg_amt,
      COUNT(DISTINCT amount)::int as distinct_amounts
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit' AND currency = 'EUR'
  `);
  console.log('\nEUR deposits:', JSON.stringify(eurOnly.rows[0]));

  // 4. EUR amount breakdown
  const eurAmounts = await pool.query(`
    SELECT amount, COUNT(*)::int as cnt
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit' AND currency = 'EUR'
    GROUP BY amount ORDER BY amount
  `);
  console.log('\nEUR amount values:');
  eurAmounts.rows.forEach(r => console.log(`  €${r.amount}: ${r.cnt} txns`));

  // 5. TRY amount breakdown
  const tryAmounts = await pool.query(`
    SELECT amount, COUNT(*)::int as cnt
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit' AND currency = 'TRY'
    GROUP BY amount ORDER BY amount
  `);
  console.log('\nTRY amount values:');
  tryAmounts.rows.forEach(r => console.log(`  ₺${r.amount}: ${r.cnt} txns`));

  // 6. Check: do users with multiple deposits have mixed currencies?
  const multiCurr = await pool.query(`
    SELECT user_id, 
      STRING_AGG(DISTINCT currency, ',') as currencies,
      COUNT(*)::int as cnt,
      SUM(CASE WHEN currency='EUR' THEN amount ELSE 0 END) as eur_total,
      SUM(CASE WHEN currency='TRY' THEN amount ELSE 0 END) as try_total
    FROM wallet_transactions 
    WHERE transaction_type = 'manual_credit'
    GROUP BY user_id
    HAVING COUNT(DISTINCT currency) > 1
    LIMIT 5
  `);
  console.log('\nUsers with MIXED currencies:', multiCurr.rows.length);
  multiCurr.rows.forEach(r => console.log(`  EUR=${r.eur_total} TRY=${r.try_total} txns=${r.cnt}`));

  // 7. Check Kamil specifically (the €38K "top depositor")
  const kamil = await pool.query(`
    SELECT wt.amount, wt.currency, wt.description, wt.created_at
    FROM wallet_transactions wt
    JOIN users u ON u.id = wt.user_id
    WHERE u.name LIKE '%Kamil Tanr%' AND wt.transaction_type = 'manual_credit'
    ORDER BY wt.created_at
  `);
  console.log('\nKamil Tanriverdi deposits (', kamil.rows.length, 'total):');
  kamil.rows.forEach(r => console.log(`  ${r.currency} ${r.amount} - ${r.description}`));

  // 8. What does the wallet balance table look like?
  const balances = await pool.query(`
    SELECT currency, COUNT(*)::int as cnt, 
      MIN(available) as min_bal, MAX(available) as max_bal, ROUND(AVG(available),2) as avg_bal
    FROM wallet_balances
    GROUP BY currency
  `);
  console.log('\nWallet balances by currency:');
  balances.rows.forEach(r => console.log(`  ${r.currency}: ${r.cnt} wallets, range=${r.min_bal}-${r.max_bal}, avg=${r.avg_bal}`));

  await pool.end();
}
main().catch(console.error);
