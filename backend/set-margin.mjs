import { pool } from './db.js';

async function setMargin() {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE currency_settings 
      SET rate_margin_percent = 0.1 
      WHERE currency_code = 'TRY'
    `);
    
    console.log('✅ Updated TRY margin to 0.1%');
    
    const result = await client.query(`
      SELECT rate_margin_percent 
      FROM currency_settings 
      WHERE currency_code = 'TRY'
    `);
    
    console.log('Verified:', result.rows[0].rate_margin_percent + '%');
  } finally {
    client.release();
    await pool.end();
  }
}

setMargin().catch(console.error);
