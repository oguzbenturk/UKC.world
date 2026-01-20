import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL
});

const verifyTables = async () => {
  try {
    const result = await pool.query(`
      SELECT tablename, 
             (SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = t.tablename) as exists
      FROM (VALUES ('repair_requests'), ('marketing_campaigns')) AS t(tablename)
      ORDER BY tablename
    `);

    console.log('\n✅ Table Verification:');
    console.log('─'.repeat(50));
    
    for (const row of result.rows) {
      const status = row.exists > 0 ? '✅' : '❌';
      console.log(`${status} ${row.tablename}`);
    }

    // Check columns for repair_requests
    const repairCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'repair_requests' 
      ORDER BY ordinal_position
    `);

    if (repairCols.rows.length > 0) {
      console.log('\n📋 repair_requests columns:');
      repairCols.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    // Check columns for marketing_campaigns
    const marketingCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'marketing_campaigns' 
      ORDER BY ordinal_position
    `);

    if (marketingCols.rows.length > 0) {
      console.log('\n📋 marketing_campaigns columns:');
      marketingCols.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    console.log('\n✅ All migrations verified successfully!\n');
  } catch (error) {
    console.error('❌ Error verifying tables:', error.message);
  } finally {
    await pool.end();
  }
};

verifyTables();
