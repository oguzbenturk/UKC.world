const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function run() {
  // 1. Instructor lessons stats
  const instrLessons = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(b.duration) as total_hours, SUM(COALESCE(b.final_amount, b.amount, 0)) as total_amount
     FROM bookings b
     WHERE b.instructor_user_id = '59ab99e9-7165-4bcb-94c3-4bbb1badad11'
       AND b.deleted_at IS NULL
       AND b.status IN ('completed', 'confirmed')`
  );
  console.log('Instructor lessons (bookings table):', instrLessons.rows[0]);

  // 2. Manager commission booking records - check metadata.duration
  const commBookings = await pool.query(
    `SELECT COUNT(*) as cnt, 
            SUM((metadata->>'duration')::numeric) as total_hours_metadata,
            SUM(source_amount) as total_source_amount,
            SUM(commission_amount) as total_commission
     FROM manager_commissions 
     WHERE source_type = 'booking' AND status != 'cancelled'`
  );
  console.log('Manager commission bookings:', commBookings.rows[0]);

  // 3. Sample some commission records to see what duration values look like
  const samples = await pool.query(
    `SELECT mc.source_id, mc.source_amount, mc.commission_amount,
            mc.metadata->>'duration' as meta_duration,
            b.duration as booking_duration,
            s.duration as service_duration,
            s.name as service_name
     FROM manager_commissions mc
     LEFT JOIN bookings b ON b.id::text = mc.source_id
     LEFT JOIN services s ON s.id = b.service_id
     WHERE mc.source_type = 'booking'
     LIMIT 10`
  );
  console.log('\nSample records (meta_dur vs booking_dur vs service_dur):');
  samples.rows.forEach(r => console.log(
    `  source_amt=${r.source_amount} comm=${r.commission_amount} meta_dur=${r.meta_duration} booking_dur=${r.booking_duration} svc_dur=${r.service_duration} svc=${r.service_name}`
  ));

  // 4. Check total bookings - how many completed vs confirmed
  const statusCounts = await pool.query(
    `SELECT status, COUNT(*) as cnt, SUM(COALESCE(final_amount, amount, 0)) as total
     FROM bookings WHERE deleted_at IS NULL AND status IN ('completed','confirmed')
     GROUP BY status`
  );
  console.log('\nBooking status breakdown:', statusCounts.rows);

  // 5. How many of those bookings have non-zero amounts?
  const nonZero = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(COALESCE(final_amount, amount)) as total, SUM(duration) as hours
     FROM bookings WHERE deleted_at IS NULL 
     AND status IN ('completed','confirmed')
     AND COALESCE(final_amount, amount, 0) > 0`
  );
  console.log('Non-zero amount bookings:', nonZero.rows[0]);

  // 6. Manager commission records count vs non-zero bookings
  const commCount = await pool.query(
    `SELECT COUNT(*) as cnt FROM manager_commissions WHERE source_type='booking'`
  );
  console.log('Commission records for bookings:', commCount.rows[0].cnt);

  // 7. Rental stats
  const rentalStats = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(total_price) as total
     FROM rentals WHERE status IN ('completed','confirmed','active')`
  );
  console.log('Rentals:', rentalStats.rows[0]);

  const commRentals = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(commission_amount) as total
     FROM manager_commissions WHERE source_type='rental'`
  );
  console.log('Commission records for rentals:', commRentals.rows[0]);

  // 8. Check how many bookings have NULL duration
  const nullDur = await pool.query(
    `SELECT COUNT(*) as cnt FROM bookings 
     WHERE deleted_at IS NULL AND status IN ('completed','confirmed')
     AND COALESCE(final_amount, amount, 0) > 0
     AND duration IS NULL`
  );
  console.log('Bookings with amount but NULL duration:', nullDur.rows[0].cnt);

  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
