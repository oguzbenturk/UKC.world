import { pool } from './db.js';

async function checkMigrations() {
  try {
    console.log('🔍 Checking migration tables...\n');
    
    // Check if tables exist
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('family_members', 'liability_waivers', 'waiver_versions', 'audit_logs')
      ORDER BY tablename
    `);
    
    console.log('✅ Tables found:', tablesResult.rows.map(r => r.tablename));
    
    // Check schema_migrations
    const migrationsResult = await pool.query(`
      SELECT filename, applied_at 
      FROM schema_migrations 
      WHERE filename LIKE '01%' OR filename LIKE '02%'
      ORDER BY filename DESC
      LIMIT 10
    `);
    
    console.log('\n📋 Recent migrations:');
    migrationsResult.rows.forEach(row => {
      console.log(`  - ${row.filename} (${row.applied_at})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkMigrations();
