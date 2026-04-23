/**
 * Backfill missing accommodation_charge wallet transactions for pay_later
 * accommodation bookings that were created before the POST /accommodation/bookings
 * handler started recording the charge (pre-fix behavior left guest balances at €0).
 *
 * Safe to re-run: it only targets bookings where wallet_transaction_id IS NULL
 * and status != 'cancelled' / payment_status != 'failed'.
 *
 * Dry run first:
 *   node backend/scripts/backfill-accommodation-pay-later-charges.js
 *
 * Apply:
 *   node backend/scripts/backfill-accommodation-pay-later-charges.js --apply
 *
 * Against production, export production DATABASE_URL before running:
 *   DATABASE_URL=... node backend/scripts/backfill-accommodation-pay-later-charges.js --apply
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { recordLegacyTransaction } from '../services/walletService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows: candidates } = await pool.query(`
    SELECT ab.id, ab.guest_id, ab.unit_id, ab.check_in_date, ab.check_out_date,
           ab.total_price, ab.created_by, ab.created_at,
           u.name AS guest_name,
           au.name AS unit_name
    FROM accommodation_bookings ab
    JOIN users u ON u.id = ab.guest_id
    LEFT JOIN accommodation_units au ON au.id = ab.unit_id
    WHERE ab.payment_method = 'pay_later'
      AND ab.wallet_transaction_id IS NULL
      AND ab.status != 'cancelled'
      AND COALESCE(ab.payment_status, '') NOT IN ('failed', 'refunded')
      AND ab.total_price > 0
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions wt
        WHERE wt.transaction_type = 'accommodation_charge'
          AND wt.user_id = ab.guest_id
          AND wt.metadata->>'accommodationBookingId' = ab.id::text
      )
    ORDER BY ab.created_at ASC
  `);

  if (candidates.length === 0) {
    console.log('No pay_later accommodation bookings need backfill.');
    await pool.end();
    return;
  }

  console.log(`Found ${candidates.length} pay_later accommodation booking(s) missing a wallet charge:\n`);
  for (const b of candidates) {
    const nights = Math.round(
      (new Date(b.check_out_date) - new Date(b.check_in_date)) / (24 * 60 * 60 * 1000)
    );
    console.log(
      `  • ${b.guest_name} — ${b.unit_name || b.unit_id} — ` +
      `${b.check_in_date.toISOString().slice(0,10)} → ${b.check_out_date.toISOString().slice(0,10)} ` +
      `(${nights}n) — €${Number(b.total_price).toFixed(2)} [booking ${b.id}]`
    );
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to insert the charges.');
    await pool.end();
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const b of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const nights = Math.round(
        (new Date(b.check_out_date) - new Date(b.check_in_date)) / (24 * 60 * 60 * 1000)
      );
      const tx = await recordLegacyTransaction({
        client,
        userId: b.guest_id,
        amount: -Math.abs(Number(b.total_price)),
        transactionType: 'accommodation_charge',
        status: 'completed',
        direction: 'debit',
        currency: 'EUR',
        description: `Accommodation charge: ${b.unit_name || 'Unit'} (${nights} night${nights !== 1 ? 's' : ''})`,
        metadata: {
          accommodationBookingId: b.id,
          unitId: b.unit_id,
          checkInDate: b.check_in_date,
          checkOutDate: b.check_out_date,
          nights,
          source: 'backfill:pay_later'
        },
        entityType: 'accommodation_booking',
        relatedEntityType: 'accommodation_booking',
        relatedEntityId: b.id,
        createdBy: b.created_by,
        allowNegative: true
      });
      await client.query(
        `UPDATE accommodation_bookings SET wallet_transaction_id = $1 WHERE id = $2`,
        [tx?.id || null, b.id]
      );
      await client.query('COMMIT');
      console.log(`  ✓ Charged ${b.guest_name} €${Number(b.total_price).toFixed(2)} (tx ${tx?.id})`);
      ok++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ Failed for booking ${b.id}: ${err.message}`);
      failed++;
    } finally {
      client.release();
    }
  }

  console.log(`\nDone. Applied: ${ok}, failed: ${failed}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
