const pg = require('pg');
require('dotenv').config({ path: './backend/.env' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Find group_bookings with confirmed/full status but NO calendar booking
  const stuck = await pool.query(`
    SELECT gb.id, gb.status, gb.booking_id, gb.scheduled_date, gb.start_time,
           gb.instructor_id, gb.organizer_id, gb.service_id, gb.price_per_person,
           gb.duration_hours, gb.max_participants, gb.notes,
           (SELECT COUNT(*) FROM group_booking_participants p WHERE p.group_booking_id = gb.id AND p.status IN ('accepted', 'paid')) AS participant_count
    FROM group_bookings gb
    WHERE gb.status IN ('confirmed', 'full', 'pending')
      AND gb.booking_id IS NULL
      AND gb.scheduled_date IS NOT NULL
      AND gb.start_time IS NOT NULL
    ORDER BY gb.created_at DESC
  `);

  console.log(`Found ${stuck.rows.length} group bookings without calendar entries. Creating bookings...`);

  for (const gb of stuck.rows) {
    try {
      const timeParts = String(gb.start_time).split(':');
      const startHour = parseInt(timeParts[0], 10) + (parseInt(timeParts[1] || 0, 10) / 60);
      const dur = parseFloat(gb.duration_hours) || 2;
      const amt = parseFloat(gb.price_per_person || 0);

      const bk = await pool.query(`
        INSERT INTO bookings (
          date, start_hour, duration,
          student_user_id, instructor_user_id, customer_user_id,
          status, payment_status, amount, final_amount,
          notes, service_id, group_size, max_participants, created_by
        ) VALUES ($1, $2, $3, $4, $5, $4, 'pending', 'unpaid', $6, $6, $7, $8, $9, $10, $4)
        RETURNING id
      `, [
        gb.scheduled_date, startHour, dur,
        gb.organizer_id, gb.instructor_id,
        amt, gb.notes || '', gb.service_id,
        parseInt(gb.participant_count) || 1, gb.max_participants
      ]);

      // Add organizer as participant
      await pool.query(`
        INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount, notes)
        VALUES ($1, $2, true, 'unpaid', 0, '')
      `, [bk.rows[0].id, gb.organizer_id]);

      // Link to group booking
      await pool.query(
        'UPDATE group_bookings SET booking_id = $1, updated_at = NOW() WHERE id = $2',
        [bk.rows[0].id, gb.id]
      );

      console.log(`  Created booking ${bk.rows[0].id} for group ${gb.id} (date: ${gb.scheduled_date}, status: ${gb.status})`);
    } catch (err) {
      console.error(`  Failed for group ${gb.id}: ${err.message}`);
    }
  }

  console.log('Done!');
  await pool.end();
})();
