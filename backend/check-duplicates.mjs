import { pool } from './db.js';

async function checkDuplicateBookings() {
  try {
    // Check for duplicate accommodation bookings (same unit, overlapping dates)
    const result = await pool.query(`
      SELECT 
        b1.id as booking1_id,
        b2.id as booking2_id,
        b1.unit_id,
        u.name as unit_name,
        b1.guest_id as guest1,
        b2.guest_id as guest2,
        b1.check_in_date as b1_checkin,
        b1.check_out_date as b1_checkout,
        b2.check_in_date as b2_checkin,
        b2.check_out_date as b2_checkout,
        b1.status as b1_status,
        b2.status as b2_status
      FROM accommodation_bookings b1
      JOIN accommodation_bookings b2 ON b1.unit_id = b2.unit_id AND b1.id < b2.id
      JOIN accommodation_units u ON b1.unit_id = u.id
      WHERE b1.status NOT IN ('cancelled')
        AND b2.status NOT IN ('cancelled')
        AND (b1.check_in_date, b1.check_out_date) OVERLAPS (b2.check_in_date, b2.check_out_date)
      ORDER BY b1.check_in_date
    `);
    
    console.log('=== Duplicate/Overlapping Accommodation Bookings ===');
    if (result.rows.length === 0) {
      console.log('No duplicate bookings found!');
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }
    
    // Also show recent bookings
    const recent = await pool.query(`
      SELECT 
        b.id, 
        u.name as unit_name, 
        g.email as guest_email,
        b.check_in_date, 
        b.check_out_date, 
        b.status,
        b.created_at
      FROM accommodation_bookings b
      JOIN accommodation_units u ON b.unit_id = u.id
      LEFT JOIN users g ON b.guest_id = g.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n=== Recent Accommodation Bookings ===');
    console.log(JSON.stringify(recent.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDuplicateBookings();
