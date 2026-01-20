import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkTables() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Checking for tables with user_id references...\n');
    
    const query = `
      SELECT 
        c.table_name,
        c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t ON c.table_name = t.table_name
      WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (c.column_name LIKE '%user_id%' OR c.column_name LIKE '%instructor_id%' OR c.column_name LIKE '%customer_id%')
      ORDER BY c.table_name, c.column_name;
    `;
    
    const result = await client.query(query);
    
    console.log(`Found ${result.rows.length} columns with user references:\n`);
    
    let currentTable = '';
    for (const row of result.rows) {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n${row.table_name}:`);
      }
      console.log(`  - ${row.column_name}`);
    }
    
    console.log('\n\n✅ Table check complete');
  } catch (error) {
    console.error('❌ Error during table check:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();
