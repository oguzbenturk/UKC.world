/**
 * Backfill customer_packages for group booking participants who paid
 * but never received a package assignment.
 * Also fixes NaN amount_paid values.
 */
const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fix NaN amount_paid values
    const nanFix = await client.query(`
      UPDATE group_booking_participants p
      SET amount_paid = gb.price_per_person
      FROM group_bookings gb
      WHERE p.group_booking_id = gb.id
        AND p.payment_status = 'paid'
        AND (p.amount_paid IS NULL OR p.amount_paid::text = 'NaN')
      RETURNING p.id, p.user_id, p.amount_paid
    `);
    console.log(`Fixed ${nanFix.rows.length} NaN amount_paid values:`);
    nanFix.rows.forEach(r => console.log(`  participant ${r.id} -> ${r.amount_paid}`));

    // 2. Find paid participants who don't have a customer_package for the group booking's package
    const paidWithoutPkg = await client.query(`
      SELECT 
        p.id as participant_id, p.user_id, p.group_booking_id,
        p.amount_paid, p.payment_method,
        gb.package_id, gb.currency,
        sp.name as pkg_name, sp.lesson_service_name, sp.total_hours,
        sp.package_type, sp.includes_lessons, sp.includes_rental, sp.includes_accommodation,
        COALESCE(sp.rental_days, 0) as rental_days_total,
        COALESCE(sp.accommodation_nights, 0) as accommodation_nights_total,
        sp.rental_service_id, sp.rental_service_name,
        sp.accommodation_unit_id, sp.accommodation_unit_name,
        u.name as user_name
      FROM group_booking_participants p
      JOIN group_bookings gb ON gb.id = p.group_booking_id
      JOIN service_packages sp ON sp.id = gb.package_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.payment_status = 'paid'
        AND p.payment_method != 'package'
        AND p.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM customer_packages cp
          WHERE cp.customer_id = p.user_id
            AND cp.service_package_id = gb.package_id
        )
    `);

    console.log(`\nFound ${paidWithoutPkg.rows.length} paid participants without customer_packages:`);

    for (const row of paidWithoutPkg.rows) {
      const cpId = uuidv4();
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      await client.query(`
        INSERT INTO customer_packages (
          id, customer_id, service_package_id, package_name, lesson_service_name,
          total_hours, remaining_hours, purchase_price, currency, expiry_date, status,
          purchase_date, notes,
          rental_days_total, rental_days_remaining, rental_days_used,
          accommodation_nights_total, accommodation_nights_remaining, accommodation_nights_used,
          package_type, includes_lessons, includes_rental, includes_accommodation,
          rental_service_id, rental_service_name, accommodation_unit_id, accommodation_unit_name
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $6, $7, $8, $9, 'active',
          NOW(), $10,
          $11, $11, 0,
          $12, $12, 0,
          $13, $14, $15, $16,
          $17, $18, $19, $20
        )
      `, [
        cpId, row.user_id, row.package_id, row.pkg_name, row.lesson_service_name || row.pkg_name,
        parseFloat(row.total_hours) || 0,
        parseFloat(row.amount_paid) || 0,
        row.currency || 'EUR', expiryDate,
        `Backfill: Group booking ${row.group_booking_id}`,
        parseInt(row.rental_days_total) || 0,
        parseInt(row.accommodation_nights_total) || 0,
        row.package_type || 'lesson',
        row.includes_lessons !== false,
        row.includes_rental === true,
        row.includes_accommodation === true,
        row.rental_service_id || null, row.rental_service_name || null,
        row.accommodation_unit_id || null, row.accommodation_unit_name || null
      ]);

      console.log(`  Created package for ${row.user_name} (${row.user_id}) -> ${cpId} [${row.pkg_name}, ${row.total_hours}h]`);
    }

    await client.query('COMMIT');
    console.log('\nDone! All changes committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error, rolled back:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
