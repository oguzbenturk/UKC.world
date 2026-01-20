import { pool } from './db.js';

async function verify() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'member_offerings' 
      AND column_name = 'use_image_background'
    `);
    
    console.log('use_image_background column:');
    console.log(result.rows);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verify();
