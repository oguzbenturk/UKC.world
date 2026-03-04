import { pool } from './backend/db.js';

// Check the booking status
const bookingId = '789c1a77-ad67-43ee-b96b-9ab99c8d4278';
const b = await pool.query(`SELECT id, status, service_id, student_user_id, date, start_hour, duration, final_amount, amount, notes, payment_status, family_member_id FROM bookings WHERE id = $1`, [bookingId]);
console.log('Booking:', JSON.stringify(b.rows[0], null, 2));

// Check if a rental was created for this booking's user and service
if (b.rows.length > 0) {
  const booking = b.rows[0];
  const r = await pool.query(`SELECT id, user_id, status, equipment_ids, rental_date, start_date, end_date, created_at FROM rentals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [booking.student_user_id]);
  console.log('\nRecent rentals for this user:', JSON.stringify(r.rows, null, 2));
}

process.exit(0);
