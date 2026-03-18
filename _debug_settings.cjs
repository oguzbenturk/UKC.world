require('dotenv').config({ path: 'backend/.env' });
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query("SELECT * FROM manager_commission_settings LIMIT 5");
  console.log('Commission settings:');
  r.rows.forEach(s => console.log(JSON.stringify(s, null, 2)));
  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
