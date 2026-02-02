import { pool } from './backend/db.js';

async function checkUser() {
  try {
    const res = await pool.query("SELECT * FROM users WHERE email LIKE '%bugra%' OR name LIKE '%bugra%'");
    console.log('User found:', res.rows[0]);
  } catch (err) {
    console.error('Error querying user:', err);
  } finally {
    await pool.end();
  }
}

checkUser();
