const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // 1. Check package-related columns in bookings
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='bookings' AND (column_name LIKE '%pack%' OR column_name LIKE '%bundle%')
    ORDER BY column_name
  `);
  console.log('Package-related columns in bookings:', cols.rows.map(r => r.column_name));

  // 2. Check if zero-amount bookings have package_id set
  const r2 = await pool.query(`
    SELECT 
      CASE WHEN customer_package_id IS NOT NULL THEN 'has_package' ELSE 'no_package' END as pkg,
      CASE WHEN COALESCE(NULLIF(final_amount,0), NULLIF(amount,0), 0) = 0 THEN 'zero' ELSE 'paid' END as amt_type,
      COUNT(*) as cnt
    FROM bookings 
    WHERE deleted_at IS NULL AND status='completed'
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  console.log('\nPackage vs Amount breakdown:');
  console.table(r2.rows);

  // 3. For Dinçer Yazgan specifically
  const dincer = await pool.query(`
    SELECT 
      CASE WHEN b.customer_package_id IS NOT NULL THEN 'package' ELSE 'individual' END as booking_type,
      COUNT(*) as cnt,
      COALESCE(SUM(COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0)), 0) as revenue,
      COALESCE(SUM(b.duration), 0) as hours
    FROM bookings b
    JOIN users u ON u.id = b.instructor_user_id
    WHERE u.first_name = 'Dinçer' AND b.deleted_at IS NULL AND b.status='completed'
    GROUP BY 1
  `);
  console.log('\nDinçer Yazgan - Package vs Individual:');
  console.table(dincer.rows);

  // 4. Show a few zero-amount booking details for Dinçer
  const samples = await pool.query(`
    SELECT b.id, b.final_amount, b.amount, b.duration, b.customer_package_id, b.created_at::date as created
    FROM bookings b
    JOIN users u ON u.id = b.instructor_user_id
    WHERE u.first_name = 'Dinçer' AND b.deleted_at IS NULL AND b.status='completed'
      AND COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0) = 0
    LIMIT 5
  `);
  console.log('\nDinçer zero-amount samples:');
  console.table(samples.rows);

  await pool.end();
})();
