import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL
});

const checkTables = async () => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('repair_requests', 'marketing_campaigns')
      ORDER BY table_name
    `);

    console.log('\n✅ Verification of New Tables:');
    console.log('─'.repeat(50));
    
    for (const row of result.rows) {
      console.log(`✅ ${row.table_name} - EXISTS`);
      
      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${row.table_name}`);
      console.log(`   Records: ${countResult.rows[0].count}`);
    }

    if (result.rows.length === 0) {
      console.log('❌ No tables found');
    } else {
      console.log('\n✅ All tables verified successfully!\n');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
};

checkTables();
