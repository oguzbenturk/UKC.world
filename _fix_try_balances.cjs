const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  const rate = await pool.query("SELECT exchange_rate FROM currency_settings WHERE currency_code = 'TRY'");
  const rateVal = parseFloat(rate.rows[0].exchange_rate);

  // Check if any TRY user also has an EUR balance row
  const overlap = await pool.query(`
    SELECT wb_try.user_id, wb_try.available_amount as try_amount, wb_eur.available_amount as eur_amount
    FROM wallet_balances wb_try
    JOIN wallet_balances wb_eur ON wb_try.user_id = wb_eur.user_id AND wb_eur.currency = 'EUR'
    WHERE wb_try.currency = 'TRY'
    LIMIT 5
  `);
  console.log('Users with both TRY and EUR balances:', overlap.rowCount);
  if (overlap.rows.length) console.log('Sample:', overlap.rows);

  // For users with both: merge TRY into EUR row, then delete TRY row
  // For users with only TRY: just convert in place
  if (overlap.rowCount > 0) {
    // Merge: add converted TRY amount to EUR balance
    const mergeResult = await pool.query(`
      UPDATE wallet_balances eur
      SET available_amount = eur.available_amount + (try_wb.available_amount / $1),
          pending_amount = eur.pending_amount + (try_wb.pending_amount / $1),
          non_withdrawable_amount = eur.non_withdrawable_amount + (try_wb.non_withdrawable_amount / $1),
          updated_at = NOW()
      FROM wallet_balances try_wb
      WHERE eur.user_id = try_wb.user_id
        AND eur.currency = 'EUR'
        AND try_wb.currency = 'TRY'
    `, [rateVal]);
    console.log('Merged TRY into EUR for', mergeResult.rowCount, 'rows');

    // Delete merged TRY rows
    const delMerged = await pool.query(`
      DELETE FROM wallet_balances
      WHERE currency = 'TRY'
        AND user_id IN (SELECT user_id FROM wallet_balances WHERE currency = 'EUR')
    `);
    console.log('Deleted merged TRY rows:', delMerged.rowCount);
  }

  // Convert remaining TRY-only balances to EUR
  const convertResult = await pool.query(`
    UPDATE wallet_balances
    SET available_amount = available_amount / $1,
        pending_amount = pending_amount / $1,
        non_withdrawable_amount = non_withdrawable_amount / $1,
        currency = 'EUR',
        updated_at = NOW()
    WHERE currency = 'TRY'
  `, [rateVal]);
  console.log('Converted remaining TRY balances:', convertResult.rowCount, 'rows');

  // Verify
  const check = await pool.query("SELECT count(*) FROM wallet_balances WHERE currency = 'TRY'");
  console.log('Remaining TRY wallet_balances:', check.rows[0].count);

  // Sample
  const sample = await pool.query("SELECT currency, count(*) FROM wallet_balances GROUP BY currency");
  console.log('Balance currencies:', sample.rows);

  await pool.end();
})();
