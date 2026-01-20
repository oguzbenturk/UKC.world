#!/usr/bin/env node

/**
 * Verify TRY Currency Fix
 * 
 * Checks:
 * 1. Auto-update is enabled
 * 2. Update frequency is set to 1 hour
 * 3. Current rate
 * 4. Conversion accuracy vs Google rate
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function verifyFix() {
  const client = await pool.connect();
  
  try {
    // Get TRY currency settings
    const result = await client.query(`
      SELECT 
        currency_code,
        exchange_rate,
        auto_update_enabled,
        update_frequency_hours,
        updated_at
      FROM currency_settings
      WHERE currency_code = 'TRY'
    `);
    
    if (!result.rows[0]) {
      console.error('❌ TRY currency not found in database');
      return;
    }
    
    const settings = result.rows[0];
    const currentRate = parseFloat(settings.exchange_rate);
    const googleRate = 50.3212; // User reported rate
    
    console.log('\n=== TRY Currency Configuration ===');
    console.log(`Rate: ${currentRate} TRY/EUR`);
    console.log(`Auto-update: ${settings.auto_update_enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`Update frequency: ${settings.update_frequency_hours} hour(s)`);
    console.log(`Last updated: ${settings.updated_at}`);
    
    // Test conversion: 90 EUR to TRY
    console.log('\n=== Test Conversion: 90 EUR ===');
    const convertedAmount = Math.ceil(90 * currentRate * 100) / 100;
    const googleAmount = Math.ceil(90 * googleRate * 100) / 100;
    const difference = googleAmount - convertedAmount;
    
    console.log(`With current rate (${currentRate}): ${convertedAmount.toFixed(2)} TRY`);
    console.log(`With Google rate (${googleRate}): ${googleAmount.toFixed(2)} TRY`);
    console.log(`Difference: ${difference.toFixed(2)} TRY ${difference > 0 ? '(charging less)' : '(charging more)'}`);
    
    // Check if we're within acceptable range (0.1%)
    const percentDiff = Math.abs((convertedAmount - googleAmount) / googleAmount * 100);
    console.log(`Percentage difference: ${percentDiff.toFixed(3)}%`);
    
    if (percentDiff < 0.1) {
      console.log('✅ Rate is accurate (within 0.1%)');
    } else if (percentDiff < 0.5) {
      console.log('⚠️ Rate is slightly outdated but acceptable (within 0.5%)');
    } else {
      console.log('❌ Rate needs update (more than 0.5% difference)');
    }
    
    // Summary
    console.log('\n=== Fix Status ===');
    const allGood = settings.auto_update_enabled && 
                    settings.update_frequency_hours === 1 && 
                    percentDiff < 0.5;
    
    if (allGood) {
      console.log('✅ All systems operational!');
      console.log('   - Auto-updates enabled');
      console.log('   - Hourly refresh configured');
      console.log('   - Rate is accurate');
      console.log('   - Conversion rounds UP (Math.ceil) to prevent losses');
    } else {
      console.log('⚠️ Issues detected:');
      if (!settings.auto_update_enabled) console.log('   - Auto-update is disabled');
      if (settings.update_frequency_hours !== 1) console.log('   - Update frequency is not hourly');
      if (percentDiff >= 0.5) console.log('   - Rate difference is too high');
    }
    
    console.log('\n=== Next Steps ===');
    console.log('The ExchangeRateService will automatically:');
    console.log('1. Fetch rates from 2 sources every hour');
    console.log('2. Use the HIGHEST rate to maximize revenue');
    console.log('3. Log all updates to currency_update_logs');
    console.log('\nNo manual intervention needed!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyFix().catch(console.error);
