import { pool } from './backend/db.js';
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND (column_name LIKE '%image%' OR column_name LIKE '%photo%' OR column_name LIKE '%avatar%' OR column_name LIKE '%picture%' OR column_name LIKE '%profile%') ORDER BY column_name`);
console.log(r.rows);
process.exit();
