import { pool } from './db.js';

const {rows} = await pool.query(`
  SELECT id, name, category 
  FROM services 
  WHERE category ILIKE '%lesson%' OR category = 'lesson'
  ORDER BY created_at DESC 
  LIMIT 10
`);

console.log('=== Lesson Services in Database ===');
rows.forEach(r => {
  console.log(`${r.name} | ${r.category}`);
});

process.exit(0);
