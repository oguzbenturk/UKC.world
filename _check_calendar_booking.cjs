const pg = require('pg');
require('dotenv').config({ path: './backend/.env' });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Update the booking that was accepted before the code fix
  const upd = await pool.query(`
    UPDATE bookings 
    SET status = 'confirmed', updated_at = NOW()
    WHERE id = 'ac270b35-fe51-4c1c-a5fe-140f927f9ef3'
      AND status = 'pending'
    RETURNING id, status, date, start_hour
  `);
  
  if (upd.rows.length > 0) {
    console.log('Updated booking to confirmed:', JSON.stringify(upd.rows[0], null, 2));
  } else {
    console.log('No update needed - booking already confirmed or not found');
  }

  // Check for any other bookings that might be stuck in pending_partner
  const stuck = await pool.query(`
    SELECT b.id, b.date, b.start_hour, b.status,
           COALESCE(st.name, st.first_name || ' ' || st.last_name) AS student_name,
           COALESCE(i.name, i.first_name || ' ' || i.last_name) AS instructor_name
    FROM bookings b
    LEFT JOIN users st ON st.id = b.student_user_id
    LEFT JOIN users i ON i.id = b.instructor_user_id
    WHERE b.status = 'pending_partner'
      AND b.deleted_at IS NULL
    ORDER BY b.date DESC
  `);
  
  console.log('\n=== BOOKINGS STILL IN pending_partner STATUS ===');
  if (stuck.rows.length === 0) {
    console.log('None found - all good!');
  } else {
    for (const row of stuck.rows) {
      console.log(`ID: ${row.id}, Date: ${row.date}, Student: ${row.student_name}, Instructor: ${row.instructor_name}`);
    }
  }

  await pool.end();

  process.exit(0);
})();
