import { pool } from './db.js';
import axios from 'axios';

async function updateTRYRate() {
  try {
    console.log('Fetching current TRY exchange rate from multiple sources...');
    
    // Fetch from multiple sources and use the highest (to avoid losing money)
    const sources = [];
    
    // Source 1: exchangerate-api.com (Free, reliable)
    try {
      const response1 = await axios.get('https://api.exchangerate-api.com/v4/latest/EUR');
      if (response1.data && response1.data.rates && response1.data.rates.TRY) {
        sources.push({ source: 'exchangerate-api.com', rate: response1.data.rates.TRY });
      }
    } catch (e) {
      console.warn('Failed to fetch from exchangerate-api.com:', e.message);
    }
    
    // Source 2: open.er-api.com (Fallback)
    try {
      const response2 = await axios.get('https://open.er-api.com/v6/latest/EUR');
      if (response2.data && response2.data.rates && response2.data.rates.TRY) {
        sources.push({ source: 'open.er-api.com', rate: response2.data.rates.TRY });
      }
    } catch (e) {
      console.warn('Failed to fetch from open.er-api.com:', e.message);
    }
    
    // Source 3: Frankfurter (ECB-based, very reliable)
    try {
      const response3 = await axios.get('https://api.frankfurter.app/latest?from=EUR&to=TRY');
      if (response3.data && response3.data.rates && response3.data.rates.TRY) {
        sources.push({ source: 'frankfurter.app (ECB)', rate: response3.data.rates.TRY });
      }
    } catch (e) {
      console.warn('Failed to fetch from frankfurter.app:', e.message);
    }
    
    // Source 4: FXRatesAPI (Commercial-grade accuracy)
    try {
      const response4 = await axios.get('https://api.fxratesapi.com/latest?base=EUR&currencies=TRY', { timeout: 5000 });
      if (response4.data && response4.data.rates && response4.data.rates.TRY) {
        sources.push({ source: 'fxratesapi.com', rate: response4.data.rates.TRY });
      }
    } catch (e) {
      console.warn('Failed to fetch from fxratesapi.com:', e.message);
    }
    
    if (sources.length === 0) {
      throw new Error('Failed to fetch exchange rates from any source');
    }
    
    console.log('\nFetched rates:');
    sources.forEach(s => console.log(`  ${s.source}: ${s.rate.toFixed(4)} TRY/EUR`));
    
    // Use the HIGHEST rate to ensure we never lose money
    const bestRate = Math.max(...sources.map(s => s.rate));
    const bestSource = sources.find(s => s.rate === bestRate);
    
    console.log(`\nUsing HIGHEST rate: ${bestRate.toFixed(4)} from ${bestSource.source}`);
    console.log('(Using highest rate protects against losses)');
    
    // Get current rate and margin from database
    const currentResult = await pool.query(`
      SELECT exchange_rate, rate_margin_percent FROM currency_settings WHERE currency_code = 'TRY'
    `);
    
    const currentRate = parseFloat(currentResult.rows[0]?.exchange_rate || 0);
    const marginPercent = parseFloat(currentResult.rows[0]?.rate_margin_percent || 0);
    
    // Apply margin to protect against rate fluctuations
    const marginMultiplier = 1 + (marginPercent / 100);
    const finalRate = bestRate * marginMultiplier;
    
    console.log(`\nApplying margin: ${marginPercent}% (multiplier: ${marginMultiplier.toFixed(4)})`);
    console.log(`Base rate: ${bestRate.toFixed(4)} TRY/EUR`);
    console.log(`Final rate (with margin): ${finalRate.toFixed(4)} TRY/EUR`);
    console.log(`\nApplying margin: ${marginPercent}% (multiplier: ${marginMultiplier.toFixed(4)})`);
    console.log(`Base rate: ${bestRate.toFixed(4)} TRY/EUR`);
    console.log(`Final rate (with margin): ${finalRate.toFixed(4)} TRY/EUR`);
    console.log(`Current DB rate: ${currentRate.toFixed(4)} TRY/EUR`);
    console.log(`Change: ${(finalRate - currentRate > 0 ? '+' : '')}${(finalRate - currentRate).toFixed(4)} TRY/EUR`);
    
    // Calculate impact on a 90 EUR booking
    const oldAmount = Math.ceil(90 * currentRate * 100) / 100;
    const newAmount = Math.ceil(90 * finalRate * 100) / 100;
    const googleAmount = Math.ceil(90 * 50.3212 * 100) / 100; // Google reference
    
    console.log(`\nImpact on 90 EUR booking:`);
    console.log(`  Old: ${oldAmount.toFixed(2)} TRY`);
    console.log(`  New: ${newAmount.toFixed(2)} TRY`);
    console.log(`  Google (~50.32): ${googleAmount.toFixed(2)} TRY`);
    console.log(`  Difference vs Google: ${(newAmount - googleAmount > 0 ? '+' : '')}${(newAmount - googleAmount).toFixed(2)} TRY`);
    
    if (newAmount >= googleAmount) {
      console.log(`  ✅ New rate MEETS or EXCEEDS Google!`);
    } else {
      console.log(`  ⚠️ Still ${(googleAmount - newAmount).toFixed(2)} TRY below Google`);
    }
    
    // Update the rate
    await pool.query(`
      UPDATE currency_settings 
      SET exchange_rate = $1, 
          updated_at = NOW()
      WHERE currency_code = 'TRY'
    `, [finalRate]);
    
    console.log('\n✅ TRY exchange rate updated successfully!');
    
    // Verify the update
    const verifyResult = await pool.query(`
      SELECT exchange_rate, updated_at FROM currency_settings WHERE currency_code = 'TRY'
    `);
    
    console.log('\nVerified:');
    console.log(`  Rate: ${parseFloat(verifyResult.rows[0].exchange_rate).toFixed(4)} TRY/EUR`);
    console.log(`  Updated: ${verifyResult.rows[0].updated_at}`);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateTRYRate();
