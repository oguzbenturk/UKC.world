const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // 1. Show current constraint
  const res = await pool.query(
    "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'check_booking_status'"
  );
  console.log('Current constraint:', JSON.stringify(res.rows, null, 2));

  // 2. Drop and recreate with pending_partner added
  await pool.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_booking_status');
  await pool.query(`
    ALTER TABLE bookings ADD CONSTRAINT check_booking_status
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'checked-in', 'checked-out', 'pending_partner'))
  `);
  console.log('Constraint updated with pending_partner');

  // Verify
  const res2 = await pool.query(
    "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'check_booking_status'"
  );
  console.log('New constraint:', JSON.stringify(res2.rows, null, 2));

  await pool.end();
}
main().catch(function(e) { console.error(e.message); process.exit(1); });
