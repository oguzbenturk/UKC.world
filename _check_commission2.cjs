const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  try {
    // Check row duplication from JOINs
    const r1 = await pool.query(`
      SELECT u.first_name || ' ' || u.last_name as name,
        COUNT(b.id) as raw_count, 
        COUNT(DISTINCT b.id) as distinct_count
      FROM bookings b 
      JOIN users u ON u.id = b.instructor_user_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.created_at BETWEEN '2026-03-01' AND '2026-03-31' AND b.deleted_at IS NULL
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY raw_count DESC LIMIT 10
    `);
    console.log('Row duplication check:');
    r1.rows.forEach(r => console.log(`  ${r.name}: raw=${r.raw_count}, distinct=${r.distinct_count}, multiplier=${(r.raw_count/r.distinct_count).toFixed(1)}x`));

    // Check Dinçer Yazgan - why commission > revenue
    const r3 = await pool.query(`
      SELECT 
        idc.commission_type, idc.commission_value,
        COUNT(DISTINCT b.id) as bookings,
        COALESCE(SUM(COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)), 0) as total_revenue,
        COALESCE(SUM(b.duration), 0) as total_hours
      FROM bookings b
      JOIN users u ON u.id = b.instructor_user_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.created_at BETWEEN '2026-03-01' AND '2026-03-31' 
        AND b.deleted_at IS NULL
        AND u.first_name = 'Dinçer'
      GROUP BY idc.commission_type, idc.commission_value
    `);
    console.log('\nDinçer Yazgan details:', r3.rows);

    // Check a sample booking for Dinçer
    const r4 = await pool.query(`
      SELECT b.id, b.final_amount, b.amount, b.duration, b.status,
        idc.commission_type, idc.commission_value,
        bcc.commission_type as bcc_type, bcc.commission_value as bcc_value
      FROM bookings b
      JOIN users u ON u.id = b.instructor_user_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
      WHERE b.created_at BETWEEN '2026-03-01' AND '2026-03-31' 
        AND b.deleted_at IS NULL
        AND u.first_name = 'Dinçer'
      LIMIT 5
    `);
    console.log('\nDinçer sample bookings:', r4.rows);

    // Check commission calculation detail for all instructors
    const r5 = await pool.query(`
      SELECT 
        u.first_name || ' ' || u.last_name as name,
        idc.commission_type, idc.commission_value,
        COUNT(DISTINCT b.id) as bookings,
        COALESCE(SUM(COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)), 0) as total_revenue,
        COALESCE(SUM(b.duration), 0) as total_hours
      FROM bookings b
      JOIN users u ON u.id = b.instructor_user_id
      LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
      WHERE b.created_at BETWEEN '2026-03-01' AND '2026-03-31' 
        AND b.deleted_at IS NULL
      GROUP BY u.id, u.first_name, u.last_name, idc.commission_type, idc.commission_value
      ORDER BY total_revenue DESC LIMIT 10
    `);
    console.log('\nAll instructor commission configs:');
    r5.rows.forEach(r => {
      const commission = r.commission_type === 'fixed' 
        ? r.commission_value * r.total_hours
        : r.commission_type === 'percentage'
          ? r.total_revenue * r.commission_value / 100
          : r.total_revenue * 0.5;
      console.log(`  ${r.name}: type=${r.commission_type}, value=${r.commission_value}, revenue=${r.total_revenue}, hours=${r.total_hours}, calc_commission=${commission.toFixed(2)}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}
main();
