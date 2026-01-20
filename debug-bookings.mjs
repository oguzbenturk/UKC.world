
import { pool } from './backend/db.js';

async function check() {
  const { rows: students } = await pool.query("SELECT users.id, users.name FROM users JOIN roles ON users.role_id = roles.id WHERE roles.name = 'student' LIMIT 1");
  if (students.length === 0) {
    console.log('No students found');
    return;
  }
  const studentId = students[0].id;
  console.log(`Checking bookings for ${students[0].name} (${studentId})`);

  const { rows: bookings } = await pool.query(`
    SELECT b.id, b.date, b.amount, b.final_amount, b.custom_price, b.status, b.payment_status
    FROM bookings b
    WHERE b.student_user_id = $1
    ORDER BY b.date DESC
    LIMIT 5
  `, [studentId]);

  console.log('Bookings:', bookings);
  
  // Also check typical "lesson" bookings specifically if any
  const { rows: lessons } = await pool.query(`
    SELECT b.id, b.date, b.amount, b.final_amount
    FROM bookings b
    WHERE b.student_user_id = $1
    LIMIT 1
  `, [studentId]);
  
  pool.end();
}

check();
