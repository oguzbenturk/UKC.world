import { pool } from './db.js';

async function checkTRYRate() {
  try {
    const result = await pool.query(`
      SELECT currency_code, exchange_rate, updated_at, is_active
      FROM currency_settings 
      WHERE currency_code = 'TRY'
    `);
    
    if (result.rows.length === 0) {
      console.log('TRY not found in database!');
    } else {
      const tryData = result.rows[0];
      console.log('\n=== TRY Exchange Rate Data ===');
      console.log('Currency:', tryData.currency_code);
      console.log('Exchange Rate:', tryData.exchange_rate);
      console.log('Last Updated:', tryData.updated_at);
      console.log('Is Active:', tryData.is_active);
      
      // Calculate what 90 EUR would be
      const eurAmount = 90;
      const tryAmount = eurAmount * parseFloat(tryData.exchange_rate);
      console.log(`\n90 EUR = ${tryAmount.toFixed(2)} TRY (current rate)`);
      console.log('Google shows: 4,528.91 TRY for 90 EUR');
      console.log('Difference:', (4528.91 - tryAmount).toFixed(2), 'TRY');
      
      // Current rate
      const currentRate = parseFloat(tryData.exchange_rate);
      const googleRate = 4528.91 / 90;
      console.log(`\nCurrent DB rate: ${currentRate.toFixed(4)} TRY/EUR`);
      console.log(`Google rate: ${googleRate.toFixed(4)} TRY/EUR`);
      console.log(`Rate difference: ${(googleRate - currentRate).toFixed(4)} TRY/EUR`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTRYRate();
