import { pool } from './backend/db.js';

async function checkRates() {
  try {
    const res = await pool.query("SELECT currency_code, exchange_rate, base_currency FROM currency_settings WHERE currency_code IN ('EUR', 'TRY', 'USD')");
    console.table(res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkRates();
