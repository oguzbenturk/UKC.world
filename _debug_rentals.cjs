require('dotenv').config({ path: 'backend/.env' });
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'rentals' ORDER BY ordinal_position");
  console.log('rentals columns:');
  r.rows.forEach(c => console.log('  ' + c.column_name));
  const r2 = await pool.query("SELECT id, total_price, customer_package_id, package_rental_id, status FROM rentals WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5");
  console.log('\nRecent rentals:');
  r2.rows.forEach(r => console.log(JSON.stringify(r)));
  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
