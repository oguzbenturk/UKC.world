import { pool } from './backend/db.js';

async function fixRates() {
  try {
    // Restore TRY rate to the real rate (~51.88 TRY per EUR)
    const res = await pool.query(
      "UPDATE currency_settings SET exchange_rate = 51.8838, updated_at = NOW() WHERE currency_code = 'TRY' RETURNING *"
    );
    console.log('Restored TRY rate:', res.rows[0]);
    
    // Restore USD rate to real rate (~1.19 USD per EUR)
    const res2 = await pool.query(
      "UPDATE currency_settings SET exchange_rate = 1.1919, updated_at = NOW() WHERE currency_code = 'USD' RETURNING *"
    );
    console.log('Restored USD rate:', res2.rows[0]);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

fixRates();
