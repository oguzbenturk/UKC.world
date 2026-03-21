const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // Check current state
  const tryTxns = await pool.query("SELECT count(*), currency FROM wallet_transactions WHERE currency = 'TRY' GROUP BY currency");
  console.log('TRY wallet_transactions:', tryTxns.rows);

  const tryBal = await pool.query("SELECT count(*), currency FROM wallet_balances WHERE currency = 'TRY' GROUP BY currency");
  console.log('TRY wallet_balances:', tryBal.rows);

  // Get exchange rate
  const rate = await pool.query("SELECT exchange_rate FROM currency_settings WHERE currency_code = 'TRY'");
  const rateVal = parseFloat(rate.rows[0].exchange_rate);
  console.log('TRY exchange rate:', rateVal);

  // Convert wallet_transactions
  const txnResult = await pool.query(
    "UPDATE wallet_transactions SET amount = amount / $1, currency = 'EUR' WHERE currency = 'TRY'",
    [rateVal]
  );
  console.log('Updated wallet_transactions:', txnResult.rowCount, 'rows');

  // Convert wallet_balances
  const balResult = await pool.query(
    "UPDATE wallet_balances SET balance = balance / $1, currency = 'EUR' WHERE currency = 'TRY'",
    [rateVal]
  );
  console.log('Updated wallet_balances:', balResult.rowCount, 'rows');

  // Verify no TRY remains
  const checkTxn = await pool.query("SELECT count(*) FROM wallet_transactions WHERE currency = 'TRY'");
  const checkBal = await pool.query("SELECT count(*) FROM wallet_balances WHERE currency = 'TRY'");
  console.log('Remaining TRY wallet_transactions:', checkTxn.rows[0].count);
  console.log('Remaining TRY wallet_balances:', checkBal.rows[0].count);

  // Sample converted records
  const sample = await pool.query("SELECT amount, currency, type FROM wallet_transactions ORDER BY created_at DESC LIMIT 5");
  console.log('Sample converted transactions:', sample.rows);

  await pool.end();
})();
