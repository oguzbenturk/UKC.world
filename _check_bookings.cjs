const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  try {
    // Check booking statuses this month
    const r1 = await pool.query(
      "SELECT status, count(*) as cnt FROM bookings WHERE deleted_at IS NULL AND date BETWEEN '2026-03-01' AND '2026-03-20' GROUP BY status ORDER BY cnt DESC"
    );
    console.log('This month statuses:', r1.rows);

    // Check normalized statuses
    const r2 = await pool.query(
      "SELECT regexp_replace(lower(trim(status)), '[^a-z0-9]+', '_', 'g') as norm_status, count(*) as cnt FROM bookings WHERE deleted_at IS NULL AND date BETWEEN '2026-03-01' AND '2026-03-20' GROUP BY norm_status ORDER BY cnt DESC"
    );
    console.log('Normalized statuses:', r2.rows);

    // Check completed bookings count matching the exact query from finances
    const r3 = await pool.query(
      "WITH normalized AS (SELECT b.id, regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') AS normalized_status FROM bookings b WHERE b.date BETWEEN '2026-03-01' AND '2026-03-20' AND b.deleted_at IS NULL) SELECT COUNT(*) FILTER (WHERE normalized_status = ANY(ARRAY['completed','done','checked_out'])) AS completed_bookings, COUNT(*) AS total FROM normalized"
    );
    console.log('Completed vs Total:', r3.rows);

    // Check if there are services linked to bookings (for service type filtering)
    const r4 = await pool.query(
      "SELECT s.category, count(*) as cnt FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.deleted_at IS NULL AND b.date BETWEEN '2026-03-01' AND '2026-03-20' GROUP BY s.category ORDER BY cnt DESC LIMIT 20"
    );
    console.log('Service categories:', r4.rows);

    // Check wallet booking charges  
    const r5 = await pool.query(
      "SELECT SUM(ABS(amount)) as total_booking_charges, count(*) as cnt FROM wallet_transactions WHERE transaction_type = 'booking_charge' AND transaction_date BETWEEN '2026-03-01' AND '2026-03-20' AND status = 'completed'"
    );
    console.log('Wallet booking charges:', r5.rows);

    // Check what date range bookings actually exist in
    const r6 = await pool.query(
      "SELECT MIN(date) as min_date, MAX(date) as max_date, count(*) as total FROM bookings WHERE deleted_at IS NULL"
    );
    console.log('Booking date range:', r6.rows);

    // Check recent bookings
    const r7 = await pool.query(
      "SELECT date, count(*) as cnt FROM bookings WHERE deleted_at IS NULL GROUP BY date ORDER BY date DESC LIMIT 10"
    );
    console.log('Recent booking dates:', r7.rows);

    // Check what column types exist for date
    const r8 = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings' AND column_name IN ('date','start_date','booking_date','created_at','start_time') ORDER BY column_name"
    );
    console.log('Date columns in bookings:', r8.rows);
    
    // Check wallet transaction dates that have booking_charge
    const r9 = await pool.query(
      "SELECT MIN(transaction_date) as min_date, MAX(transaction_date) as max_date FROM wallet_transactions WHERE transaction_type = 'booking_charge'"
    );
    console.log('Wallet booking charge date range:', r9.rows);

    // Check bookings created_at in this month
    const r10 = await pool.query(
      "SELECT count(*) as cnt FROM bookings WHERE deleted_at IS NULL AND created_at BETWEEN '2026-03-01' AND '2026-03-21'"
    );
    console.log('Bookings created this month:', r10.rows);

    // Check commission would work with created_at
    const r11 = await pool.query(
      "SELECT count(*) as cnt, SUM(COALESCE(NULLIF(final_amount,0), NULLIF(amount,0), 0)) as total_amount FROM bookings WHERE deleted_at IS NULL AND created_at BETWEEN '2026-03-01' AND '2026-03-21' AND regexp_replace(lower(trim(status)), '[^a-z0-9]+', '_', 'g') = ANY(ARRAY['completed','done','checked_out'])"
    );
    console.log('Completed bookings by created_at:', r11.rows);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
