const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // 1. customer_packages columns
  const cpCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customer_packages' ORDER BY ordinal_position");
  console.log('=== CUSTOMER_PACKAGES COLUMNS ===');
  cpCols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 2. accommodation_bookings columns
  const abCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'accommodation_bookings' ORDER BY ordinal_position");
  console.log('\n=== ACCOMMODATION_BOOKINGS COLUMNS ===');
  abCols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 3. Actual customer_packages data (accommodation-related)
  const pkgs = await pool.query("SELECT id, package_name, check_in_date, check_out_date, last_used_date, accommodation_nights_total, accommodation_nights_used, accommodation_nights_remaining, status FROM customer_packages WHERE accommodation_nights_total > 0");
  console.log('\n=== ACCOMMODATION PACKAGES DATA ===');
  pkgs.rows.forEach(r => console.log(JSON.stringify(r)));

  // 4. Actual accommodation_bookings data 
  const abs = await pool.query("SELECT id, unit_id, guest_id, check_in_date, check_out_date, status FROM accommodation_bookings LIMIT 10");
  console.log('\n=== ACCOMMODATION_BOOKINGS DATA ===');
  abs.rows.forEach(r => console.log(JSON.stringify(r)));

  // 5. How pg returns a date column  
  const dateTest = await pool.query("SELECT check_in_date, pg_typeof(check_in_date) as dtype FROM customer_packages WHERE check_in_date IS NOT NULL LIMIT 1");
  console.log('\n=== DATE TYPE TEST ===');
  if (dateTest.rows.length > 0) {
    const val = dateTest.rows[0].check_in_date;
    console.log('  Raw value:', val);
    console.log('  typeof:', typeof val);
    console.log('  Is Date?:', val instanceof Date);
    if (val instanceof Date) console.log('  toISOString:', val.toISOString());
  } else {
    console.log('  No check_in_date data found');
  }

  await pool.end();
})();
