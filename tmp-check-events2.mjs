import { pool } from './backend/db.js';
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position`);
console.log(r.rows.map(x => x.column_name));
process.exit();
