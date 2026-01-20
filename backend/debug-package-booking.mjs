import { pool } from './db.js';

async function debugPackageBooking() {
  try {
    // Get a sample package booking
    const query = `
      SELECT 
        b.id as booking_id,
        b.date,
        b.duration as booking_duration,
        b.amount,
        b.final_amount,
        b.payment_status,
        b.customer_package_id,
        cp.package_name,
        cp.purchase_price,
        cp.total_hours as cp_total_hours,
        cp.remaining_hours as cp_remaining_hours,
        cp.used_hours as cp_used_hours,
        sp.sessions_count,
        sp.name as sp_name,
        srv.duration as service_duration,
        srv.name as service_name,
        COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) as commission_rate,
        COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type, 'percentage') as commission_type
      FROM bookings b
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      LEFT JOIN services srv ON srv.id = b.service_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.customer_package_id IS NOT NULL
        AND b.date >= '2026-01-01'
        AND regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') IN ('completed', 'done', 'checked_out')
      LIMIT 5
    `;

    const result = await pool.query(query);

    console.log('\n=== PACKAGE BOOKING DEBUG ===\n');
    console.log(`Found ${result.rows.length} package bookings\n`);

    for (const row of result.rows) {
      console.log(`📦 Booking ID: ${row.booking_id}`);
      console.log(`   Date: ${row.date?.toISOString().substring(0, 10)}`);
      console.log(`   Duration: ${row.booking_duration}h`);
      console.log(`   Amount: ${row.amount} EUR`);
      console.log(`   Final Amount: ${row.final_amount} EUR`);
      console.log(`   Payment Status: ${row.payment_status}`);
      console.log(`\n   Package: ${row.package_name}`);
      console.log(`   Purchase Price: ${row.purchase_price} EUR`);
      console.log(`   Total Hours: ${row.cp_total_hours}h`);
      console.log(`   Remaining Hours: ${row.cp_remaining_hours}h`);
      console.log(`   Used Hours: ${row.cp_used_hours}h`);
      console.log(`   Sessions Count: ${row.sessions_count}`);
      console.log(`\n   Service: ${row.service_name}`);
      console.log(`   Service Duration: ${row.service_duration}h`);
      console.log(`   Commission Rate: ${row.commission_rate}${row.commission_type === 'percentage' ? '%' : ' EUR/h'}`);
      console.log(`   Commission Type: ${row.commission_type}`);

      // Calculate lesson amount like deriveLessonAmount does
      const price = parseFloat(row.purchase_price || 0);
      const duration = parseFloat(row.booking_duration || 0);
      const totalHours = parseFloat(row.cp_total_hours || 0);
      const usedHours = parseFloat(row.cp_used_hours || 0);
      const remainingHours = parseFloat(row.cp_remaining_hours || 0);
      const sessions = parseInt(row.sessions_count || 0);
      const serviceDuration = parseFloat(row.service_duration || 0);

      let effectiveHours = 0;
      if (totalHours > 0) {
        effectiveHours = totalHours;
      } else if (usedHours + remainingHours > 0) {
        effectiveHours = usedHours + remainingHours;
      } else if (sessions > 0 && serviceDuration > 0) {
        effectiveHours = sessions * serviceDuration;
      }

      let lessonAmount = 0;
      if (effectiveHours > 0 && price > 0 && duration > 0) {
        const pricePerHour = price / effectiveHours;
        lessonAmount = pricePerHour * duration;
      } else if (sessions > 0 && price > 0) {
        lessonAmount = price / sessions;
      }

      console.log(`\n   📊 CALCULATED:`);
      console.log(`   Effective Hours: ${effectiveHours}h`);
      console.log(`   Price Per Hour: ${effectiveHours > 0 ? (price / effectiveHours).toFixed(2) : 0} EUR/h`);
      console.log(`   Lesson Amount: ${lessonAmount.toFixed(2)} EUR`);
      
      let commission = 0;
      const commRate = parseFloat(row.commission_rate || 50);
      if (row.commission_type === 'fixed') {
        commission = commRate * duration;
      } else {
        commission = lessonAmount * commRate / 100;
      }
      console.log(`   Commission: ${commission.toFixed(2)} EUR`);
      console.log('\n' + '-'.repeat(80) + '\n');
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

debugPackageBooking();
