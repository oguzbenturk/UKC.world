// Quick script to check financial_settings table
import { pool } from './backend/db.js';

async function checkFinanceSettings() {
  const client = await pool.connect();
  
  try {
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'financial_settings';
    `);
    
    console.log('Table exists:', tableCheck.rows.length > 0);
    
    if (tableCheck.rows.length > 0) {
      // Get all financial settings
      const settings = await client.query('SELECT * FROM financial_settings ORDER BY id');
      console.log('Financial settings records:', settings.rows.length);
      console.log('Settings data:', JSON.stringify(settings.rows, null, 2));
      
      // Get active settings
      const activeSettings = await client.query('SELECT * FROM financial_settings WHERE active = true');
      console.log('Active settings:', activeSettings.rows.length);
      if (activeSettings.rows.length > 0) {
        console.log('Active setting:', JSON.stringify(activeSettings.rows[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('Error checking financial settings:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkFinanceSettings().catch(console.error);
