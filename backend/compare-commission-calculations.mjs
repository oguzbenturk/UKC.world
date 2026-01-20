import { pool } from './db.js';
import { getInstructorEarningsData } from './services/instructorFinanceService.js';

async function compareCommissionCalculations() {
  try {
    // Get all instructors
    const instructorsResult = await pool.query(`
      SELECT u.id, u.name, u.email 
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'instructor' AND u.deleted_at IS NULL
      ORDER BY u.name
    `);

    console.log('\n=== COMMISSION CALCULATION COMPARISON ===\n');
    console.log(`Found ${instructorsResult.rows.length} instructors\n`);

    for (const instructor of instructorsResult.rows) {
      console.log(`\n📊 Instructor: ${instructor.name} (${instructor.email})`);
      console.log(`ID: ${instructor.id}\n`);

      // Method 1: Using getInstructorEarningsData (instructor history page)
      const startDate = '2026-01-01';
      const endDate = '2026-12-31';
      
      const { earnings, totals } = await getInstructorEarningsData(instructor.id, { startDate, endDate });
      
      console.log(`✅ Method 1 (instructorFinanceService):`);
      console.log(`   Total Earnings: ${totals.totalEarnings.toFixed(2)} EUR`);
      console.log(`   Total Lessons: ${totals.totalLessons}`);
      console.log(`   Total Hours: ${totals.totalHours}`);

      // Method 2: Using finance page query (lessons finance page)
      const commissionQuery = `
        SELECT 
          COUNT(*) as booking_count,
          COALESCE(SUM(
            CASE 
              WHEN bcc.commission_type = 'percentage' THEN 
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 30) / 100
              WHEN bcc.commission_type = 'fixed' THEN 
                COALESCE(bcc.commission_value, 0)
              WHEN isc.commission_type = 'percentage' THEN 
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 30) / 100
              WHEN isc.commission_type = 'fixed' THEN 
                COALESCE(isc.commission_value, 0)
              WHEN idc.commission_type = 'percentage' THEN 
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 30) / 100
              WHEN idc.commission_type = 'fixed' THEN 
                COALESCE(idc.commission_value, 0)
              ELSE 
                COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.30
            END
          ), 0) AS total_commission
        FROM bookings b
        LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
        LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
        LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
        WHERE b.instructor_user_id = $1
          AND b.date >= $2::date AND b.date <= $3::date
          AND b.deleted_at IS NULL
          AND regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') IN ('completed', 'done', 'checked_out')
      `;

      const commissionResult = await pool.query(commissionQuery, [instructor.id, startDate, endDate]);
      const financePageCommission = parseFloat(commissionResult.rows[0]?.total_commission) || 0;
      const bookingCount = parseInt(commissionResult.rows[0]?.booking_count) || 0;

      console.log(`\n❌ Method 2 (finance page query):`);
      console.log(`   Total Commission: ${financePageCommission.toFixed(2)} EUR`);
      console.log(`   Booking Count: ${bookingCount}`);

      const difference = totals.totalEarnings - financePageCommission;
      console.log(`\n📉 DISCREPANCY: ${difference.toFixed(2)} EUR`);
      
      if (Math.abs(difference) > 0.01) {
        console.log(`   ⚠️  Methods DO NOT match!`);
        console.log(`\n   Sample earnings breakdown:`);
        earnings.slice(0, 5).forEach((earning, idx) => {
          console.log(`   ${idx + 1}. Booking ${earning.booking_id}:`);
          console.log(`      Date: ${earning.lesson_date?.substring(0, 10)}`);
          console.log(`      Duration: ${earning.lesson_duration}h`);
          console.log(`      Base Amount: ${earning.base_amount} EUR`);
          console.log(`      Lesson Amount: ${earning.lesson_amount} EUR`);
          console.log(`      Commission Rate: ${earning.commission_rate}%`);
          console.log(`      Total Earnings: ${earning.total_earnings} EUR`);
          console.log(`      Package: ${earning.package_name || 'None'}`);
          console.log('');
        });
      } else {
        console.log(`   ✅ Methods match!`);
      }

      console.log('\n' + '='.repeat(80));
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

compareCommissionCalculations();
