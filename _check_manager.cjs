const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function run() {
  try {
    // Check total bookings and rentals
    // Check booking columns
    const bcols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name LIKE '%amount%' OR (table_name='bookings' AND column_name LIKE '%price%') OR (table_name='bookings' AND column_name LIKE '%total%') ORDER BY ordinal_position`);
    console.log('Booking amount columns:', bcols.rows.map(r=>r.column_name));

    const rcols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='rentals' AND (column_name LIKE '%amount%' OR column_name LIKE '%price%' OR column_name LIKE '%total%') ORDER BY ordinal_position`);
    console.log('Rental amount columns:', rcols.rows.map(r=>r.column_name));

    // Check commission settings 
    const settings = await pool.query(
      `SELECT * FROM manager_commission_settings WHERE is_active = true`
    );
    console.log('Active settings:', JSON.stringify(settings.rows, null, 2));

    // Check all commission records
    const comms = await pool.query(
      `SELECT source_type, status, COUNT(*) as cnt, SUM(commission_amount) as total
       FROM manager_commissions 
       GROUP BY source_type, status
       ORDER BY source_type, status`
    );
    console.log('Commission records by type/status:', comms.rows);

    // Check manager user
    const mgr = await pool.query(
      `SELECT u.id, u.name, u.email, r.name as role 
       FROM users u JOIN roles r ON r.id = u.role_id 
       WHERE r.name = 'manager' AND u.deleted_at IS NULL`
    );
    console.log('Managers:', mgr.rows);

    // Check when commission feature was added (first migration)
    // Check total bookings (completed/confirmed)
    const bookings = await pool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(final_amount),0) as total 
       FROM bookings WHERE deleted_at IS NULL AND status IN ('completed','confirmed')`
    );
    console.log('Completed/Confirmed Bookings:', bookings.rows[0]);

    const rentals = await pool.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_price),0) as total 
       FROM rentals WHERE status IN ('completed','confirmed','active')`
    );
    console.log('Completed/Confirmed Rentals:', rentals.rows[0]);

    // Check which bookings already exist in manager_commissions
    const existing = await pool.query(
      `SELECT source_id FROM manager_commissions WHERE source_type = 'booking'`
    );
    console.log('Bookings with commissions:', existing.rows.length);

    // Check migration files
    const mig = await pool.query(
      `SELECT * FROM schema_migrations WHERE migration LIKE '%manager%' ORDER BY migration LIMIT 10`
    );
    console.log('Manager migrations:', mig.rows);

  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
run();
