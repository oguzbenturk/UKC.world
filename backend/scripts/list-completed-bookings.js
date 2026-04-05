#!/usr/bin/env node
import { pool } from '../db.js';

async function main() {
  const { rows } = await pool.query(`
    SELECT id,
           status,
           final_amount,
           amount,
           deleted_at,
           date,
           checkout_time,
           payment_status
      FROM bookings
     WHERE LOWER(status) IN ('completed','done','checked_out')
     ORDER BY date DESC;
  `);

  console.table(rows);
  await pool.end();
}

main().catch((error) => {
  console.error('Failed to list completed bookings', error);
  process.exitCode = 1;
});
