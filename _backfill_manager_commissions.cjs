/**
 * Backfill manager commissions for ALL historical completed/confirmed bookings and rentals
 * that don't already have commission records.
 * 
 * Uses the manager's current commission settings (10% booking, 10% rental).
 * Run: node _backfill_manager_commissions.cjs
 */
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function run() {
  const client = await pool.connect();

  try {
    // 1. Get manager & settings
    const settingsRes = await client.query(
      `SELECT mcs.*, u.name as manager_name
       FROM manager_commission_settings mcs
       JOIN users u ON u.id = mcs.manager_user_id
       WHERE mcs.is_active = true
       LIMIT 1`
    );
    if (settingsRes.rows.length === 0) {
      console.log('No active manager commission settings found.');
      return;
    }
    const settings = settingsRes.rows[0];
    const managerId = settings.manager_user_id;
    const bookingRate = parseFloat(settings.booking_rate) || 0;
    const rentalRate = parseFloat(settings.rental_rate) || 0;

    console.log(`Manager: ${settings.manager_name} (${managerId})`);
    console.log(`Booking rate: ${bookingRate}%, Rental rate: ${rentalRate}%`);

    // 2. Get already recorded source_ids to avoid duplicates
    const existingRes = await client.query(
      `SELECT source_type, source_id FROM manager_commissions WHERE manager_user_id = $1`,
      [managerId]
    );
    const existingSet = new Set(existingRes.rows.map(r => `${r.source_type}:${r.source_id}`));
    console.log(`Existing commission records: ${existingSet.size}`);

    await client.query('BEGIN');

    // 3. Backfill BOOKINGS
    let bookingCount = 0;
    let bookingTotal = 0;
    if (bookingRate > 0) {
      const bookings = await client.query(
        `SELECT b.id, b.final_amount, b.amount, b.currency, b.date, b.group_size,
                b.service_id, b.customer_package_id, b.duration,
                s.name as service_name,
                u_student.name as student_name,
                u_instr.name as instructor_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN users u_student ON u_student.id = b.student_user_id
         LEFT JOIN users u_instr ON u_instr.id = b.instructor_user_id
         WHERE b.deleted_at IS NULL
           AND b.status IN ('completed', 'confirmed')
         ORDER BY b.date ASC`
      );

      for (const b of bookings.rows) {
        if (existingSet.has(`booking:${b.id}`)) continue;

        const sourceAmount = parseFloat(b.final_amount || b.amount || 0);
        if (sourceAmount <= 0) continue;

        const commission = (sourceAmount * bookingRate) / 100;
        const periodMonth = b.date ? new Date(b.date).toISOString().slice(0, 7) : null;

        await client.query(
          `INSERT INTO manager_commissions 
           (id, manager_user_id, source_type, source_id, source_amount, source_currency,
            commission_rate, commission_amount, commission_currency, period_month, status,
            source_date, calculated_at, metadata, created_at, updated_at)
           VALUES ($1, $2, 'booking', $3, $4, $5, $6, $7, 'EUR', $8, 'pending', $9, NOW(),
                   $10, NOW(), NOW())`,
          [
            uuidv4(), managerId, b.id,
            sourceAmount, b.currency || 'EUR',
            bookingRate, commission,
            periodMonth, b.date,
            JSON.stringify({
              studentName: b.student_name || null,
              instructorName: b.instructor_name || null,
              serviceName: b.service_name || null,
              duration: b.duration || null,
              groupSize: b.group_size || 1,
              calculatedBy: 'backfill',
            }),
          ]
        );
        bookingCount++;
        bookingTotal += commission;
      }
      console.log(`Backfilled ${bookingCount} booking commissions: ${bookingTotal.toFixed(2)} EUR`);
    }

    // 4. Backfill RENTALS
    let rentalCount = 0;
    let rentalTotal = 0;
    if (rentalRate > 0) {
      const rentals = await client.query(
        `SELECT r.id, r.total_price, r.start_date, r.end_date, r.status,
                u_cust.name as customer_name
         FROM rentals r
         LEFT JOIN users u_cust ON u_cust.id = r.user_id
         WHERE r.status IN ('completed', 'confirmed', 'active')
         ORDER BY r.start_date ASC`
      );

      for (const r of rentals.rows) {
        if (existingSet.has(`rental:${r.id}`)) continue;

        const sourceAmount = parseFloat(r.total_price || 0);
        if (sourceAmount <= 0) continue;

        const commission = (sourceAmount * rentalRate) / 100;
        const periodMonth = r.start_date ? new Date(r.start_date).toISOString().slice(0, 7) : null;

        await client.query(
          `INSERT INTO manager_commissions 
           (id, manager_user_id, source_type, source_id, source_amount, source_currency,
            commission_rate, commission_amount, commission_currency, period_month, status,
            source_date, calculated_at, metadata, created_at, updated_at)
           VALUES ($1, $2, 'rental', $3, $4, 'EUR', $5, $6, 'EUR', $7, 'pending', $8, NOW(),
                   $9, NOW(), NOW())`,
          [
            uuidv4(), managerId, r.id,
            sourceAmount,
            rentalRate, commission,
            periodMonth, r.start_date,
            JSON.stringify({
              customerName: r.customer_name || null,
              startDate: r.start_date,
              endDate: r.end_date,
              calculatedBy: 'backfill',
            }),
          ]
        );
        rentalCount++;
        rentalTotal += commission;
      }
      console.log(`Backfilled ${rentalCount} rental commissions: ${rentalTotal.toFixed(2)} EUR`);
    }

    await client.query('COMMIT');
    console.log(`\nDone! Total backfilled: ${bookingCount + rentalCount} records, ${(bookingTotal + rentalTotal).toFixed(2)} EUR`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error, rolled back:', e.message);
  } finally {
    client.release();
    pool.end();
  }
}

run();
