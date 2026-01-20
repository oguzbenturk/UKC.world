import { pool } from './db.js';

async function checkAuditLogsSchema() {
  try {
    console.log('🔍 Checking audit_logs table schema...\n');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ audit_logs table does NOT exist');
      process.exit(0);
    }
    
    console.log('✅ audit_logs table EXISTS\n');
    
    // Get all columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Columns:');
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'}`);
    });
    
    // Get indexes
    const indexesResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'audit_logs'
    `);
    
    console.log('\n📊 Indexes:');
    indexesResult.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAuditLogsSchema();
