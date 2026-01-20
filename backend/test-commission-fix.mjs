import { pool } from './db.js';

async function testFinanceCommissionFix() {
  try {
    const dateStart = '2026-01-01';
    const dateEnd = '2026-12-31';
    const LEDGER_COMPLETED_BOOKING_STATUSES = ['completed', 'done', 'checked_out'];

    console.log('\n=== TESTING FIXED COMMISSION CALCULATION ===\n');
    console.log(`Date Range: ${dateStart} to ${dateEnd}\n`);

    const commissionQuery = `
      SELECT 
        COALESCE(SUM(
          CASE 
            -- Package bookings with fixed hourly rate commission
            WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
            -- Package bookings with percentage commission
            WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
              ((cp.purchase_price / cp.total_hours) * b.duration) * 
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
            WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
              (cp.purchase_price / sp.sessions_count) * 
              COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
            -- Standalone bookings with fixed hourly rate
            WHEN bcc.commission_type = 'fixed' THEN 
              COALESCE(bcc.commission_value, 0) * b.duration
            WHEN isc.commission_type = 'fixed' THEN 
              COALESCE(isc.commission_value, 0) * b.duration
            WHEN idc.commission_type = 'fixed' THEN 
              COALESCE(idc.commission_value, 0) * b.duration
            -- Standalone bookings with percentage commission
            WHEN bcc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
            WHEN isc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
            WHEN idc.commission_type = 'percentage' THEN 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
            -- Fallback: 50% of lesson amount
            ELSE 
              COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
          END
        ), 0) AS total_commission,
        COUNT(*) FILTER (WHERE b.customer_package_id IS NOT NULL) as package_bookings,
        COUNT(*) FILTER (WHERE b.customer_package_id IS NULL) as standalone_bookings,
        COUNT(*) as total_bookings
      FROM bookings b
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
      WHERE b.date >= $1::date AND b.date <= $2::date
        AND b.deleted_at IS NULL
        AND regexp_replace(lower(trim(b.status)), '[^a-z0-9]+', '_', 'g') = ANY($3::text[])
    `;

    const result = await pool.query(commissionQuery, [dateStart, dateEnd, LEDGER_COMPLETED_BOOKING_STATUSES]);
    
    const { total_commission, package_bookings, standalone_bookings, total_bookings } = result.rows[0];

    console.log(`✅ FIXED Commission Query Results:`);
    console.log(`   Total Commission: ${parseFloat(total_commission).toFixed(2)} EUR`);
    console.log(`   Total Bookings: ${total_bookings}`);
    console.log(`   Package Bookings: ${package_bookings}`);
    console.log(`   Standalone Bookings: ${standalone_bookings}`);
    console.log('');

    console.log(`📊 EXPECTED: 1500.00 EUR (from instructor history)`);
    console.log(`📊 ACTUAL: ${parseFloat(total_commission).toFixed(2)} EUR`);
    console.log('');

    const match = Math.abs(parseFloat(total_commission) - 1500.00) < 0.01;
    
    if (match) {
      console.log(`✅✅✅ SUCCESS! Commission calculation now matches instructor history!`);
    } else {
      console.log(`❌ MISMATCH: Expected 1500.00 but got ${parseFloat(total_commission).toFixed(2)}`);
      console.log(`   Difference: ${(parseFloat(total_commission) - 1500.00).toFixed(2)} EUR`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testFinanceCommissionFix();
