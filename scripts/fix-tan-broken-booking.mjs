// One-shot data repair: convert booking a4d3eba7 (Tan Doğan, 2026-05-30)
// from its broken "paid" state to the proper "partial" state that the now-
// fixed CalendarContext + /calendar code would have produced.
//
// Current state:
//   - payment_status='paid', final_amount=190 (full cash, but no wallet charge)
//   - customer_package_id linked, package NOT consumed (5/6 used, 1 remaining)
//   - no instructor_earnings row
//
// Target state:
//   - payment_status='partial', final_amount=95 (1h cash leg only)
//   - package: 6/6 used, 0 remaining, status='used_up'
//   - wallet_transactions: -95 EUR booking_charge
//   - instructor_earnings: created by cascade (fixed 20€/h × 2h = 40 EUR)

import { pool } from './db.js';
import { recordTransaction } from './services/walletService.js';
import BookingUpdateCascadeService from './services/bookingUpdateCascadeService.js';

const BOOKING_ID = 'a4d3eba7-2f25-4b7c-9cd5-16390036a430';
const PACKAGE_ID = '195d52b4-b3d1-4170-b937-763aacd11429';
const USER_ID = 'f6178f6c-3e25-43c3-9da3-af966eeb5ba8';
const PACKAGE_HOURS_TO_CONSUME = 1;
const CASH_AMOUNT = 95;
const TOTAL_HOURS = 6;

const client = await pool.connect();
let exitCode = 0;
let updatedBooking = null;

try {
  await client.query('BEGIN');

  // Sanity checks — refuse to act if state has drifted.
  const bookingRes = await client.query(
    `SELECT id, student_user_id, payment_status, final_amount, amount, customer_package_id, duration, currency
       FROM bookings WHERE id = $1 FOR UPDATE`,
    [BOOKING_ID]
  );
  if (!bookingRes.rows.length) throw new Error('Booking not found');
  const b = bookingRes.rows[0];
  if (b.payment_status !== 'paid') throw new Error(`Booking already in state ${b.payment_status}`);
  if (b.student_user_id !== USER_ID) throw new Error('Student mismatch');
  if (b.customer_package_id !== PACKAGE_ID) throw new Error('Package link mismatch');

  const pkgRes = await client.query(
    `SELECT id, used_hours, remaining_hours, status FROM customer_packages WHERE id = $1 FOR UPDATE`,
    [PACKAGE_ID]
  );
  if (!pkgRes.rows.length) throw new Error('Package not found');
  const p = pkgRes.rows[0];
  if (Number(p.remaining_hours) < PACKAGE_HOURS_TO_CONSUME) {
    throw new Error(`Package only has ${p.remaining_hours}h remaining, need ${PACKAGE_HOURS_TO_CONSUME}h`);
  }

  const wtRes = await client.query(
    `SELECT id FROM wallet_transactions WHERE booking_id = $1`,
    [BOOKING_ID]
  );
  if (wtRes.rows.length > 0) throw new Error('Wallet transaction already exists for this booking — refusing to act');

  // 1. Consume package hour
  const newUsed = Number(p.used_hours) + PACKAGE_HOURS_TO_CONSUME;
  const newRemaining = Number(p.remaining_hours) - PACKAGE_HOURS_TO_CONSUME;
  await client.query(
    `UPDATE customer_packages
        SET used_hours = $1::numeric, remaining_hours = $2::numeric,
            last_used_date = CURRENT_DATE,
            updated_at = NOW(),
            status = CASE
              WHEN $2::numeric <= 0
                AND COALESCE(rental_days_remaining, 0) <= 0
                AND COALESCE(accommodation_nights_remaining, 0) <= 0
              THEN 'used_up' ELSE 'active' END
      WHERE id = $3`,
    [newUsed, newRemaining, PACKAGE_ID]
  );
  console.log(`Package consumed: ${p.used_hours}h → ${newUsed}h (remaining ${newRemaining}h)`);

  // 2. Update booking to partial state
  const upd = await client.query(
    `UPDATE bookings
        SET payment_status = 'partial',
            amount = $1, final_amount = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [CASH_AMOUNT, BOOKING_ID]
  );
  updatedBooking = upd.rows[0];
  console.log(`Booking updated: payment_status=partial, final_amount=${CASH_AMOUNT}`);

  // 3. Post the cash-leg wallet charge
  const tx = await recordTransaction({
    client,
    userId: USER_ID,
    amount: -CASH_AMOUNT,
    availableDelta: -CASH_AMOUNT,
    transactionType: 'booking_charge',
    direction: 'debit',
    currency: updatedBooking.currency || 'EUR',
    status: 'completed',
    description: `Partial lesson cash leg (1h): 2026-05-30 (2h total) — manual repair`,
    bookingId: BOOKING_ID,
    entityType: 'booking',
    relatedEntityType: 'booking',
    relatedEntityId: BOOKING_ID,
    metadata: {
      bookingId: BOOKING_ID,
      cashHours: 1,
      packageHours: 1,
      durationHours: 2,
      source: 'manual_repair_calendar_partial_bug',
    },
    allowNegative: true,
    createdBy: null,
  });
  console.log(`Wallet charge posted: ${tx.id}`);

  await client.query('COMMIT');
  console.log('Booking + package + wallet committed.');
} catch (e) {
  console.error('Error during repair, rolling back:', e.message);
  await client.query('ROLLBACK');
  exitCode = 1;
} finally {
  client.release();
}

// 4. Run the cascade outside the manual transaction so it manages its own.
if (exitCode === 0 && updatedBooking) {
  try {
    await BookingUpdateCascadeService.cascadeBookingUpdate(updatedBooking, {
      _custom_commission_changed: true,
    });
    console.log('Cascade ran — instructor_earnings created.');

    const verify = await pool.query(
      `SELECT lesson_amount, commission_rate, total_earnings FROM instructor_earnings WHERE booking_id = $1`,
      [BOOKING_ID]
    );
    console.log('Earnings row:', JSON.stringify(verify.rows[0] || null));
  } catch (cascadeErr) {
    console.error('Cascade failed:', cascadeErr?.message);
    exitCode = 1;
  }
}

await pool.end();
process.exit(exitCode);
