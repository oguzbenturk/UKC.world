import { pool } from '../db.js';

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE 'voucher%' OR table_name = 'user_vouchers')
    `);
    console.log('Existing voucher tables:', result.rows);
    
    // Also check for types
    const types = await pool.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname LIKE 'voucher%'
    `);
    console.log('Existing voucher types:', types.rows);
    
    // Check if migration is marked as applied
    const migrationCheck = await pool.query(
      "SELECT * FROM schema_migrations WHERE filename = '102_create_voucher_system.sql'"
    );
    console.log('Migration applied status:', migrationCheck.rows);
    
    // Check columns in voucher_codes
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'voucher_codes'
      ORDER BY ordinal_position
    `);
    console.log('voucher_codes columns:', columns.rows);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTables();
