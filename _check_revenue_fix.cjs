const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // Test: Instructor breakdown query (matches /finances/lesson-breakdown)
  const r = await pool.query(`
    SELECT 
      u.id AS instructor_id,
      COALESCE(u.first_name || ' ' || u.last_name, u.email) AS instructor_name,
      COUNT(b.id) AS booking_count,
      COALESCE(SUM(b.duration), 0) AS total_hours,
      COALESCE(SUM(
        CASE 
          WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 
            THEN (cp.purchase_price / cp.total_hours) * b.duration
          WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0
            THEN cp.purchase_price / sp.sessions_count
          ELSE COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0)
        END
      ), 0) AS total_revenue,
      COALESCE(SUM(
        CASE 
          WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
            COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
          WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
            ((cp.purchase_price / cp.total_hours) * b.duration) * 
            COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
          WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
            (cp.purchase_price / sp.sessions_count) * 
            COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
          WHEN bcc.commission_type = 'fixed' THEN 
            COALESCE(bcc.commission_value, 0) * b.duration
          WHEN isc.commission_type = 'fixed' THEN 
            COALESCE(isc.commission_value, 0) * b.duration
          WHEN idc.commission_type = 'fixed' THEN 
            COALESCE(idc.commission_value, 0) * b.duration
          WHEN bcc.commission_type = 'percentage' THEN 
            COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
          WHEN isc.commission_type = 'percentage' THEN 
            COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
          WHEN idc.commission_type = 'percentage' THEN 
            COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
          ELSE 
            COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
        END
      ), 0) AS total_commission
    FROM bookings b
    JOIN users u ON u.id = b.instructor_user_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
    LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
    LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
    WHERE b.deleted_at IS NULL
    GROUP BY u.id, u.first_name, u.last_name, u.email
    ORDER BY total_revenue DESC
    LIMIT 10
  `);

  // Also get summary total commission for cross-check
  const summary = await pool.query(`
    SELECT COALESCE(SUM(
      CASE 
        WHEN b.customer_package_id IS NOT NULL AND COALESCE(bcc.commission_type, isc.commission_type, idc.commission_type) = 'fixed' THEN
          COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) * b.duration
        WHEN b.customer_package_id IS NOT NULL AND cp.total_hours > 0 THEN
          ((cp.purchase_price / cp.total_hours) * b.duration) * COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
        WHEN b.customer_package_id IS NOT NULL AND sp.sessions_count > 0 THEN
          (cp.purchase_price / sp.sessions_count) * COALESCE(bcc.commission_value, isc.commission_value, idc.commission_value, 50) / 100
        WHEN bcc.commission_type = 'fixed' THEN COALESCE(bcc.commission_value, 0) * b.duration
        WHEN isc.commission_type = 'fixed' THEN COALESCE(isc.commission_value, 0) * b.duration
        WHEN idc.commission_type = 'fixed' THEN COALESCE(idc.commission_value, 0) * b.duration
        WHEN bcc.commission_type = 'percentage' THEN COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(bcc.commission_value, 50) / 100
        WHEN isc.commission_type = 'percentage' THEN COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(isc.commission_value, 50) / 100
        WHEN idc.commission_type = 'percentage' THEN COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * COALESCE(idc.commission_value, 50) / 100
        ELSE COALESCE(NULLIF(b.final_amount, 0), NULLIF(b.amount, 0), 0) * 0.50
      END
    ), 0) AS total_commission
    FROM bookings b
    LEFT JOIN booking_custom_commissions bcc ON bcc.booking_id = b.id
    LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
    LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
    LEFT JOIN customer_packages cp ON cp.id = b.customer_package_id
    LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
    WHERE b.deleted_at IS NULL
  `);
  
  // Also get each instructor's commission config
  const configs = await pool.query(`
    SELECT u.first_name || ' ' || u.last_name as name, idc.commission_type, idc.commission_value
    FROM instructor_default_commissions idc
    JOIN users u ON u.id = idc.instructor_id
    ORDER BY u.first_name
  `);

  console.log('=== Instructor Commission Configs ===');
  configs.rows.forEach(c => console.log(`  ${c.name}: ${c.commission_type} @ ${c.commission_value}`));

  console.log('\n=== Per-Instructor Breakdown (lesson-breakdown query) ===');
  let sumRev = 0, sumCom = 0;
  r.rows.forEach(row => {
    const rev = parseFloat(row.total_revenue);
    const com = parseFloat(row.total_commission);
    sumRev += rev;
    sumCom += com;
    const pct = rev > 0 ? ((com / rev) * 100).toFixed(1) : '0.0';
    const ok = rev >= com ? 'OK' : 'WARN';
    console.log(`  ${row.instructor_name}: Revenue=${rev.toFixed(2)}, Commission=${com.toFixed(2)} (${pct}%), Bookings=${row.booking_count}, Hours=${parseFloat(row.total_hours).toFixed(1)} [${ok}]`);
  });

  console.log(`\n  TOTALS: Revenue=${sumRev.toFixed(2)}, Commission=${sumCom.toFixed(2)}`);
  console.log(`  Summary endpoint total commission: ${parseFloat(summary.rows[0].total_commission).toFixed(2)}`);

  await pool.end();
})();
