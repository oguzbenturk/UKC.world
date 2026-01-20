import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL
});

const checkMigrations = async () => {
  try {
    const result = await pool.query(`
      SELECT name, applied_at 
      FROM db_migrations 
      WHERE name LIKE '10%'
      ORDER BY name
    `);

    console.log('\n📋 Applied Migrations (10x series):');
    console.log('─'.repeat(70));
    
    if (result.rows.length === 0) {
      console.log('No migrations in 10x series applied yet.');
    } else {
      result.rows.forEach(row => {
        console.log(`✅ ${row.name.padEnd(40)} ${new Date(row.applied_at).toLocaleString()}`);
      });
    }

    console.log(`\nTotal: ${result.rows.length} migrations\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
};

checkMigrations();
