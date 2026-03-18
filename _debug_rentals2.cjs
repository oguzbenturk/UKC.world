require('dotenv').config({ path: 'backend/.env' });
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query("SELECT id, total_price, payment_status, customer_package_id, rental_days_used, status FROM rentals ORDER BY created_at DESC LIMIT 8");
  console.log('Recent rentals:');
  r.rows.forEach(r => console.log(JSON.stringify(r)));
  const r2 = await pool.query("SELECT cp.id, cp.purchase_price, cp.total_hours, cp.currency, sp.rental_days, sp.includes_rental, sp.price, sp.name FROM customer_packages cp LEFT JOIN service_packages sp ON sp.id = cp.service_package_id WHERE cp.id IN (SELECT DISTINCT customer_package_id FROM rentals WHERE customer_package_id IS NOT NULL) LIMIT 3");
  console.log('\nPackages with rentals:');
  r2.rows.forEach(r => console.log(JSON.stringify(r)));
  // Also check what columns service_packages has related to rentals
  const r3 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'service_packages' AND column_name LIKE '%rental%' ORDER BY ordinal_position");
  console.log('\nservice_packages rental columns:');
  r3.rows.forEach(r => console.log('  ' + r.column_name));
  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
