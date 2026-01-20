import { pool } from './backend/db.js';
const result = await pool.query('SELECT id, version_number, language_code, LENGTH(content) as content_length FROM waiver_versions ORDER BY created_at DESC LIMIT 3');
console.log(result.rows);
await pool.end();
