import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL
});

async function addColumns() {
  const client = await pool.connect();
  try {
    // Add analytics columns if they don't exist
    await client.query(`
      ALTER TABLE marketing_campaigns 
      ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS opened_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS clicked_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS converted_count INTEGER DEFAULT 0
    `);
    console.log('✅ Analytics columns added successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addColumns();
