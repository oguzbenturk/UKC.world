
import { pool } from './backend/db.js';

async function check() {
  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'bookings'
  `);
  console.log(rows.map(r => r.column_name));
  pool.end();
}

check();
