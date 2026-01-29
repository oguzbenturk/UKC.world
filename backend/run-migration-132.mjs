import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'plannivoDB',
  user: 'plannivo',
  password: 'Gezdim35*'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration 132: Add rental package support...');
    
    const migrationPath = path.join(__dirname, 'migrations', '132_add_rental_package_support.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');
    
    console.log('✅ Migration 132 completed successfully!');
    
    // Check the new columns
    const checkResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customer_packages' 
      AND column_name LIKE '%rental%'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 New rental-related columns:');
    checkResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error running migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
