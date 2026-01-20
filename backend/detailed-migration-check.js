import { pool } from './db.js';

async function detailedMigrationCheck() {
  try {
    console.log('🔍 Detailed Migration Check\n');
    console.log('='.repeat(60));
    
    // 1. Check all public tables
    const allTablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log('\n📊 All tables in public schema:');
    allTablesResult.rows.forEach(row => {
      const isNewTable = ['family_members', 'liability_waivers', 'waiver_versions', 'audit_logs'].includes(row.tablename);
      console.log(`  ${isNewTable ? '✨' : '  '} ${row.tablename}`);
    });
    
    // 2. Check schema_migrations
    const migrationCheckResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
    `);
    
    if (migrationCheckResult.rows[0].count === '0') {
      console.log('\n⚠️  schema_migrations table does NOT exist!');
      console.log('   Migrations have never run on this database.');
    } else {
      const migrationsResult = await pool.query(`
        SELECT filename, applied_at, checksum 
        FROM schema_migrations 
        ORDER BY applied_at DESC
        LIMIT 15
      `);
      
      console.log('\n📋 Last 15 migrations applied:');
      migrationsResult.rows.forEach((row, idx) => {
        const isNew = row.filename && row.filename.match(/^(017|018|019|020|021|022|023)_/);
        console.log(`  ${isNew ? '✨' : '  '} ${idx+1}. ${row.filename || 'N/A'} (${row.applied_at ? row.applied_at.toISOString().slice(0,19) : 'N/A'})`);
      });
    }
    
    // 3. Check for our specific new tables
    const targetTables = ['family_members', 'liability_waivers', 'waiver_versions', 'audit_logs'];
    console.log('\n🎯 Target table status:');
    
    for (const tableName of targetTables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = $1
        )
      `, [tableName]);
      
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}`);
    }
    
    console.log('\n' + '='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

detailedMigrationCheck();
