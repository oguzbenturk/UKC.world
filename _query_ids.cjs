const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Users table columns
  const userCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
  console.log('=== USER COLUMNS ===');
  userCols.rows.forEach(r => console.log(r.column_name));

  const prods = await pool.query("SELECT id, name, price, stock_quantity, status FROM products WHERE status = 'active' ORDER BY id");
  console.log('\n=== PRODUCTS ===');
  prods.rows.forEach(r => console.log(JSON.stringify(r)));

  const vars = await pool.query("SELECT id, name, variants, colors, sizes FROM products WHERE status = 'active' ORDER BY id");
  console.log('\n=== PRODUCT VARIANTS/COLORS/SIZES ===');
  vars.rows.forEach(r => console.log(JSON.stringify(r)));

  // Events columns first
  const evtCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'events' ORDER BY ordinal_position");
  console.log('\n=== EVENT COLUMNS ===');
  evtCols.rows.forEach(r => console.log(r.column_name));

  const evts = await pool.query("SELECT * FROM events LIMIT 5");
  console.log('\n=== EVENTS ===');
  evts.rows.forEach(r => console.log(JSON.stringify(r)));

  // member_offerings columns
  const memCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'member_offerings' ORDER BY ordinal_position");
  console.log('\n=== MEMBER_OFFERING COLUMNS ===');
  memCols.rows.forEach(r => console.log(r.column_name));

  const mems = await pool.query("SELECT * FROM member_offerings WHERE is_active = true ORDER BY id");
  console.log('\n=== MEMBER_OFFERINGS ===');
  mems.rows.forEach(r => console.log(JSON.stringify(r)));

  const pkgs = await pool.query("SELECT id, name, price, total_hours, rental_days, accommodation_nights, package_type FROM service_packages ORDER BY name");
  console.log('\n=== SERVICE_PACKAGES ===');
  pkgs.rows.forEach(r => console.log(JSON.stringify(r)));

  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'repair_requests' ORDER BY ordinal_position");
  console.log('\n=== REPAIR_REQUESTS COLUMNS ===');
  cols.rows.forEach(r => console.log(r.column_name));

  // Specific package details
  const pkgDetails = await pool.query("SELECT id, name, lesson_service_id, lesson_service_name, rental_service_id, package_hourly_rate FROM service_packages WHERE id IN ('22af8b3d-087a-4198-b2bd-7efb7689aae7','fb1b0860-0a58-4757-82f4-91946a38ff7c','7c28e424-b463-43d2-b239-470c2741b8c9','32ab3bf7-93db-422f-8113-b1150bf5ed64')");
  console.log('\n=== KEY PACKAGE DETAILS ===');
  pkgDetails.rows.forEach(r => console.log(JSON.stringify(r)));

  await pool.end();
})();
