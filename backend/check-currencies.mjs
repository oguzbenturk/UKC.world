// Quick check for currencies in database
import { pool } from './db.js';

const checkCurrencies = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM currency_settings ORDER BY base_currency DESC, currency_code');
    console.log('Current currencies in database:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length === 0) {
      console.log('\nNo currencies found! Inserting defaults...');
      await client.query(`
        INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
        VALUES 
          ('EUR', 'Euro', '€', true, 1.0000, true, 2),
          ('USD', 'US Dollar', '$', true, 1.0800, false, 2),
          ('TRY', 'Turkish Lira', '₺', true, 36.5000, false, 2)
        ON CONFLICT (currency_code) DO UPDATE SET
          is_active = true
      `);
      console.log('Default currencies inserted!');
    }
  } finally {
    client.release();
    process.exit(0);
  }
};

checkCurrencies();
