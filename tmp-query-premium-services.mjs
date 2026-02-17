import { pool } from './backend/db.js';

const sql = `
  SELECT id, name, category, discipline_tag, lesson_category_tag, level_tag, service_type, duration, price, created_at
  FROM services
  WHERE lower(name) LIKE $1
  ORDER BY created_at DESC
  LIMIT 20
`;

try {
  const { rows } = await pool.query(sql, ['%premium%']);
  console.table(rows);
} finally {
  await pool.end();
}
