const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const { rows: bookings } = await pool.query(
    `SELECT ab.id, ab.unit_id, au.name as unit_name, au.type as unit_type, u.name as guest_name
     FROM accommodation_bookings ab
     LEFT JOIN accommodation_units au ON ab.unit_id = au.id
     LEFT JOIN users u ON ab.guest_id = u.id
     ORDER BY ab.created_at DESC LIMIT 10`
  );
  console.log('=== BOOKINGS ===');
  bookings.forEach(r => console.log(`  guest=${r.guest_name} | unit_id=${r.unit_id} | unit_name=${r.unit_name} | type=${r.unit_type}`));

  const { rows: pkgs } = await pool.query(
    `SELECT cp.id, cp.package_name, cp.accommodation_unit_id, cp.accommodation_unit_name,
            au.name as joined_unit_name, u.name as customer_name, cp.check_in_date
     FROM customer_packages cp
     LEFT JOIN accommodation_units au ON au.id = cp.accommodation_unit_id
     LEFT JOIN users u ON u.id = cp.customer_id
     WHERE cp.accommodation_unit_id IS NOT NULL OR cp.includes_accommodation = true
     ORDER BY cp.created_at DESC LIMIT 10`
  );
  console.log('\n=== PACKAGE STAYS (customer_packages) ===');
  pkgs.forEach(r => console.log(`  customer=${r.customer_name} | pkg=${r.package_name} | accom_unit_id=${r.accommodation_unit_id} | stored_name=${r.accommodation_unit_name} | joined_name=${r.joined_unit_name} | checkin=${r.check_in_date}`));

  const { rows: units } = await pool.query('SELECT id, name, type FROM accommodation_units ORDER BY name');
  console.log('\n=== ALL UNITS ===');
  units.forEach(r => console.log(`  id=${r.id} | name=${r.name} | type=${r.type}`));

  pool.end();
})();
