import { pool } from './db.js';

async function fullCleanup() {
  try {
    console.log('🧹 FULL CHAT MIGRATION CLEANUP\n');
    
    // 1. Drop all chat tables
    console.log('1. Dropping tables...');
    const tables = ['message_reactions', 'messages', 'conversation_participants', 'conversations'];
    for (const table of tables) {
      try {
        await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`  ✅ ${table}`);
      } catch (err) {
        console.log(`  ⚠️  ${table}: ${err.message}`);
      }
    }
    
    // 2. Drop all custom types
    console.log('\n2. Dropping custom types...');
    const types = ['conversation_type', 'message_type', 'delivery_status', 'read_status'];
    for (const type of types) {
      try {
        await pool.query(`DROP TYPE IF EXISTS ${type} CASCADE`);
        console.log(`  ✅ ${type}`);
      } catch (err) {
        console.log(`  ⚠️  ${type}: ${err.message}`);
      }
    }
    
    // 3. Drop all indexes (redundant but safe)
    console.log('\n3. Dropping indexes...');
    const indexes = [
      'idx_message_reactions_message',
      'idx_message_reactions_user',
      'idx_messages_conversation',
      'idx_messages_sender',
      'idx_conversation_participants_conversation',
      'idx_conversation_participants_user',
      'idx_conversations_type',
      'idx_conversations_last_activity'
    ];
    for (const idx of indexes) {
      try {
        await pool.query(`DROP INDEX IF EXISTS ${idx}`);
        console.log(`  ✅ ${idx}`);
      } catch (err) {
        console.log(`  ⚠️  ${idx}: ${err.message}`);
      }
    }
    
    // 4. Remove migration records
    console.log('\n4. Removing migration records...');
    const result = await pool.query(`DELETE FROM schema_migrations WHERE migration_name LIKE '118%' RETURNING migration_name`);
    if (result.rowCount > 0) {
      result.rows.forEach(r => console.log(`  ✅ Removed: ${r.migration_name}`));
    } else {
      console.log('  ℹ️  No migration records to remove');
    }
    
    console.log('\n✅ CLEANUP COMPLETE! Ready to run migration.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

fullCleanup();
