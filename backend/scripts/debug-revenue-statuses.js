#!/usr/bin/env node
import { pool } from '../db.js';

async function main() {
  const { rows: bookingRows } = await pool.query(`
    SELECT status,
           COUNT(*) AS count,
           COALESCE(SUM(COALESCE(final_amount, amount, 0)), 0)::numeric AS total
      FROM bookings
     WHERE COALESCE(final_amount, amount, 0) > 0
       AND deleted_at IS NULL
     GROUP BY status
     ORDER BY status;
  `);

  const { rows: rentalRows } = await pool.query(`
    SELECT status,
           COUNT(*) AS count,
           COALESCE(SUM(COALESCE(total_price, 0)), 0)::numeric AS total
      FROM rentals
     WHERE COALESCE(total_price, 0) > 0
     GROUP BY status
     ORDER BY status;
  `);

  const { rows: accommodationRows } = await pool.query(`
    SELECT status,
           COUNT(*) AS count,
           COALESCE(SUM(COALESCE(total_price, 0)), 0)::numeric AS total
      FROM accommodation_bookings
     WHERE COALESCE(total_price, 0) > 0
     GROUP BY status
     ORDER BY status;
  `);

  console.log('Bookings status summary');
  console.table(bookingRows);

  console.log('\nRentals status summary');
  console.table(rentalRows);

  console.log('\nAccommodation status summary');
  console.table(accommodationRows);

  await pool.end();
}

main().catch((error) => {
  console.error('Failed to summarize statuses', error);
  process.exitCode = 1;
});
