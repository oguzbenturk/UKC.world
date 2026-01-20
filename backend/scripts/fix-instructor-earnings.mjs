#!/usr/bin/env node
/**
 * Fix Historical Instructor Earnings Script
 * 
 * This script:
 * 1. Creates missing instructor_earnings records for completed bookings
 * 2. Recalculates lesson_amount for existing records with incorrect values
 * 
 * Usage:
 *   node scripts/fix-instructor-earnings.mjs --dry-run    # Preview changes
 *   node scripts/fix-instructor-earnings.mjs              # Apply changes
 */

import { pool } from '../db.js';
import { deriveLessonAmount, deriveTotalEarnings } from '../utils/instructorEarnings.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function getCompletedBookingsWithoutEarnings() {
  const { rows } = await pool.query(`
    SELECT 
      b.id as booking_id,
      b.instructor_user_id,
      b.duration,
      b.date as lesson_date,
      b.payment_status,
      b.currency as booking_currency,
      COALESCE(b.final_amount, b.amount, 0) as base_amount,
      cp.purchase_price as package_price,
      cp.total_hours as package_total_hours,
      cp.remaining_hours as package_remaining_hours,
      cp.used_hours as package_used_hours,
      sp.sessions_count as package_sessions_count,
      COALESCE(sp.total_hours / NULLIF(sp.sessions_count, 0), srv.duration) as service_duration,
      srv.name as service_name,
      COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50.0) as commission_rate
    FROM bookings b
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN services srv ON srv.id = b.service_id
    LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
    LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
    LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
    LEFT JOIN instructor_earnings ie ON ie.booking_id = b.id
    WHERE b.status = 'completed'
      AND b.deleted_at IS NULL
      AND b.instructor_user_id IS NOT NULL
      AND ie.id IS NULL
    ORDER BY b.date DESC
  `);
  
  return rows;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX INSTRUCTOR EARNINGS SCRIPT');
  console.log(DRY_RUN ? '*** DRY RUN MODE - No changes will be made ***' : '*** LIVE MODE - Changes will be applied ***');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Create missing earnings records
  const missingEarnings = await getCompletedBookingsWithoutEarnings();
  console.log(`Found ${missingEarnings.length} completed bookings WITHOUT earnings records\n`);

  let createdCount = 0;
  let errorCount = 0;
  const created = [];

  for (const record of missingEarnings) {
    try {
      const lessonAmount = deriveLessonAmount({
        paymentStatus: record.payment_status,
        duration: toNumber(record.duration),
        baseAmount: toNumber(record.base_amount),
        packagePrice: toNumber(record.package_price),
        packageTotalHours: toNumber(record.package_total_hours),
        packageRemainingHours: toNumber(record.package_remaining_hours),
        packageUsedHours: toNumber(record.package_used_hours),
        packageSessionsCount: toNumber(record.package_sessions_count),
        fallbackSessionDuration: toNumber(record.service_duration) || toNumber(record.duration),
      });

      const commissionRate = toNumber(record.commission_rate); // Keep as percentage (38 means 38%)
      const totalEarnings = deriveTotalEarnings({ lessonAmount, commissionRate });

      created.push({
        booking_id: record.booking_id,
        service_name: record.service_name,
        payment_status: record.payment_status,
        lesson_amount: lessonAmount,
        total_earnings: totalEarnings,
        commission_rate: record.commission_rate,
      });

      if (!DRY_RUN && lessonAmount > 0) {
        await pool.query(`
          INSERT INTO instructor_earnings 
          (instructor_id, booking_id, base_rate, commission_rate, total_earnings, lesson_amount, lesson_date, lesson_duration, currency)
          VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9)
        `, [
          record.instructor_user_id,
          record.booking_id,
          record.commission_rate,           // base_rate as percentage
          commissionRate / 100,             // commission_rate as decimal for storage
          totalEarnings,
          lessonAmount,
          record.lesson_date,
          record.duration || 1,
          record.booking_currency || 'EUR'  // Currency from the booking
        ]);
      }
      createdCount++;
    } catch (error) {
      console.error(`Error creating earning for booking ${record.booking_id}:`, error.message);
      errorCount++;
    }
  }

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Completed bookings without earnings: ${missingEarnings.length}`);
  console.log(`Earnings records created: ${createdCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log();

  if (created.length > 0) {
    console.log('EARNINGS RECORDS ' + (DRY_RUN ? '(PREVIEW)' : '(CREATED)') + ':');
    console.log('-'.repeat(60));
    
    console.table(created.slice(0, 20).map(f => ({
      'Booking ID': f.booking_id.substring(0, 8) + '...',
      'Service': f.service_name?.substring(0, 20) || 'N/A',
      'Payment': f.payment_status,
      'Lesson Amt': f.lesson_amount.toFixed(2),
      'Commission': f.commission_rate + '%',
      'Earnings': f.total_earnings.toFixed(2),
    })));

    if (created.length > 20) {
      console.log(`... and ${created.length - 20} more records`);
    }
  }

  if (DRY_RUN && createdCount > 0) {
    console.log('\n*** Run without --dry-run to apply these changes ***\n');
  }

  await pool.end();
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
