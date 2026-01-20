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

async function checkColumnTypes() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Checking column types for user_sessions and wallet tables...\n');
    
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name IN ('user_sessions', 'wallet_balances', 'wallet_transactions')
      AND (column_name LIKE '%user_id%')
      ORDER BY table_name, column_name;
    `;
    
    const result = await client.query(query);
    
    for (const row of result.rows) {
      console.log(`${row.table_name}.${row.column_name}: ${row.data_type}`);
    }
    
    console.log('\n✅ Check complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumnTypes();
