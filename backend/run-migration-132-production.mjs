import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use production database connection from .env
const pool = new Pool({
  connectionString: 'postgresql://plannivo:WHMgux86@plannivo.com:5432/plannivo',
  ssl: false
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to production database...');
    console.log('Starting migration 132: Add rental package support...\n');
    
    const migrationPath = path.join(__dirname, 'migrations', '132_add_rental_package_support.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📋 Executing migration SQL...');
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');
    
    console.log('✅ Migration 132 completed successfully!\n');
    
    // Check the new columns
    const checkResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'customer_packages' 
      AND (
        column_name LIKE '%rental%' 
        OR column_name LIKE '%accommodation%'
        OR column_name = 'package_type'
        OR column_name LIKE 'includes_%'
      )
      ORDER BY ordinal_position
    `);
    
    console.log('📋 New package-related columns added:');
    console.log('─'.repeat(80));
    checkResult.rows.forEach(row => {
      const defaultVal = row.column_default ? ` (default: ${row.column_default})` : '';
      console.log(`  ✓ ${row.column_name.padEnd(35)} ${row.data_type}${defaultVal}`);
    });
    console.log('─'.repeat(80));
    
    // Check existing packages
    const packagesCount = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE includes_rental = TRUE) as rental_packages,
        COUNT(*) FILTER (WHERE includes_lessons = TRUE) as lesson_packages,
        COUNT(*) FILTER (WHERE includes_rental = TRUE AND includes_lessons = TRUE) as combo_packages
      FROM customer_packages
    `);
    
    const stats = packagesCount.rows[0];
    console.log('\n📊 Package Statistics:');
    console.log(`  Total packages: ${stats.total}`);
    console.log(`  Lesson packages: ${stats.lesson_packages}`);
    console.log(`  Rental packages: ${stats.rental_packages}`);
    console.log(`  Combo packages: ${stats.combo_packages}`);
    
    console.log('\n✨ Migration complete! Rental packages will now display in customer profiles.');
    
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
  console.error('\n💥 Migration failed:', err.message);
  process.exit(1);
});
