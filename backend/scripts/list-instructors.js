#!/usr/bin/env node
import { pool } from '../db.js';

async function main() {
  const { rows } = await pool.query(`
    SELECT id,
      name,
      hourly_rate
      FROM users
     WHERE role_id IN (SELECT id FROM roles WHERE LOWER(name) = 'instructor');
  `);

  console.table(rows);
  await pool.end();
}

main().catch((error) => {
  console.error('Failed to list instructors', error);
  process.exitCode = 1;
});
