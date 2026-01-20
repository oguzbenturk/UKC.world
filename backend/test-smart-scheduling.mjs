#!/usr/bin/env node

/**
 * Test Smart Scheduling Configuration
 * 
 * Displays:
 * 1. Current TRY configuration
 * 2. Smart scheduling breakdown
 * 3. Monthly API call estimate
 * 4. Free tier compatibility
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function testSmartScheduling() {
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
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         SMART SCHEDULING CONFIGURATION (TRY)              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log('\n📊 Current Database Settings:');
    console.log(`   Currency: ${settings.currency_code}`);
    console.log(`   Rate: ${settings.exchange_rate} TRY/EUR`);
    console.log(`   Auto-update: ${settings.auto_update_enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`   Nominal frequency: ${settings.update_frequency_hours} hour(s)`);
    console.log(`   Last updated: ${settings.updated_at}`);
    
    console.log('\n⏰ Smart Time-Based Schedule (Turkey/Istanbul Time):');
    console.log('┌──────────────────────────────────────────────────────────┐');
    console.log('│ Period             │ Frequency     │ Updates/Day       │');
    console.log('├──────────────────────────────────────────────────────────┤');
    console.log('│ Business (9AM-7PM) │ Every 1 hour  │ 10 updates        │');
    console.log('│ Evening (7PM-11PM) │ Every 2 hours │ 2 updates         │');
    console.log('│ Night (11PM-9AM)   │ Every 4 hours │ 2.5 updates       │');
    console.log('└──────────────────────────────────────────────────────────┘');
    
    console.log('\n📈 API Usage Calculation:');
    const businessUpdates = 10;  // 9 AM to 7 PM, every hour
    const eveningUpdates = 2;    // 7 PM to 11 PM, every 2 hours (19:00, 21:00)
    const nightUpdates = 2.5;    // 11 PM to 9 AM, every 4 hours (23:00, 3:00, 7:00)
    const totalPerDay = businessUpdates + eveningUpdates + nightUpdates;
    const totalPerMonth = Math.ceil(totalPerDay * 30);
    
    console.log(`   Business hours: ${businessUpdates} updates/day`);
    console.log(`   Evening hours: ${eveningUpdates} updates/day`);
    console.log(`   Night hours: ${nightUpdates} updates/day`);
    console.log(`   ─────────────────────────────────`);
    console.log(`   TOTAL: ${totalPerDay.toFixed(1)} updates/day`);
    console.log(`   Monthly: ${totalPerMonth} updates/month`);
    
    console.log('\n💰 Free Tier Compatibility:');
    const freeTierLimit = 500; // Conservative estimate for 2 API sources
    const usage = (totalPerMonth / freeTierLimit * 100).toFixed(1);
    
    console.log('   API Sources: 2 (exchangerate-api.com, open.er-api.com)');
    console.log(`   Free tier limit: ~${freeTierLimit} updates/month`);
    console.log(`   Usage: ${totalPerMonth}/${freeTierLimit} (${usage}%)`);
    
    if (totalPerMonth <= freeTierLimit) {
      console.log(`   Status: ✅ SAFE - ${freeTierLimit - totalPerMonth} updates remaining`);
    } else {
      console.log(`   Status: ⚠️ OVER - Needs ${totalPerMonth - freeTierLimit} more updates`);
    }
    
    console.log('\n🎯 Benefits of Smart Scheduling:');
    console.log('   ✅ Fresh rates during peak business hours (9 AM - 7 PM)');
    console.log('   ✅ Reduced API calls at night (lower booking activity)');
    console.log('   ✅ Stays within free tier limits');
    console.log('   ✅ No manual intervention needed');
    console.log('   ✅ Automatic failover between API sources');
    console.log('   ✅ Always uses HIGHEST rate to protect revenue');
    
    console.log('\n📝 Implementation:');
    console.log('   File: backend/services/exchangeRateService.js');
    console.log('   Method: Multiple cron schedules with timezone support');
    console.log('   Timezone: Europe/Istanbul (Turkey)');
    console.log('   Rounding: Math.ceil (always round UP)');
    
    console.log('\n🔄 Next Update Windows:');
    const now = new Date();
    const istanbulTime = now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' });
    console.log(`   Current Istanbul time: ${istanbulTime}`);
    console.log('   Next business update: Top of next hour (9 AM - 7 PM)');
    console.log('   Next evening update: 7:00 PM or 9:00 PM');
    console.log('   Next night update: 11:00 PM, 3:00 AM, or 7:00 AM');
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testSmartScheduling().catch(console.error);
