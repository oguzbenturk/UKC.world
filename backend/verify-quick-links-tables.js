import { pool } from './db.js';

(async () => {
  const client = await pool.connect();
  try {
    // Check if quick_links table exists
    const quickLinksCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'quick_links'
      );
    `);
    
    const quickLinkRegistrationsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'quick_link_registrations'
      );
    `);
    
    console.log('\n✅ Table Verification:');
    console.log('  quick_links:', quickLinksCheck.rows[0].exists ? '✓ EXISTS' : '✗ MISSING');
    console.log('  quick_link_registrations:', quickLinkRegistrationsCheck.rows[0].exists ? '✓ EXISTS' : '✗ MISSING');
    
    if (quickLinksCheck.rows[0].exists) {
      // Get table structure
      const structure = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'quick_links'
        ORDER BY ordinal_position;
      `);
      console.log('\n📋 quick_links columns:');
      structure.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }
    
    // Try to query the table
    if (quickLinksCheck.rows[0].exists) {
      const count = await client.query('SELECT COUNT(*) FROM quick_links');
      console.log(`\n📊 Current quick_links count: ${count.rows[0].count}`);
    }
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    client.release();
    process.exit();
  }
})();
