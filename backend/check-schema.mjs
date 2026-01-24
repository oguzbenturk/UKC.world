import { pool } from './db.js';

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'member_purchases' 
        AND column_name IN ('user_id', 'offering_id')
    `);
    console.log('=== member_purchases columns ===');
    console.log(JSON.stringify(result.rows, null, 2));
    
    const offerings = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'member_offerings' 
        AND column_name = 'id'
    `);
    console.log('\n=== member_offerings.id ===');
    console.log(JSON.stringify(offerings.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkSchema();
