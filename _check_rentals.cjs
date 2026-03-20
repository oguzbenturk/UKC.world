const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // 1. Sample rental data
  const samples = await pool.query(`
    SELECT equipment_ids, equipment_details, total_price, payment_status, created_by
    FROM rentals WHERE status IN ('completed','returned','closed','active') LIMIT 3
  `);
  console.log('Sample rentals:');
  samples.rows.forEach((row, i) => {
    console.log(`Row ${i}:`, JSON.stringify(row));
  });

  // 2. Count rentals with various data
  const counts = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN equipment_ids IS NOT NULL AND equipment_ids::text != 'null' THEN 1 ELSE 0 END) as has_eq_ids,
      SUM(CASE WHEN equipment_details IS NOT NULL AND equipment_details::text != 'null' THEN 1 ELSE 0 END) as has_eq_det,
      SUM(CASE WHEN created_by IS NOT NULL THEN 1 ELSE 0 END) as has_created_by
    FROM rentals WHERE status IN ('completed','returned','closed','active')
  `);
  console.log('\nData counts:', counts.rows[0]);

  // 3. Try to get equipment names from services via equipment_ids
  const eqBreakdown = await pool.query(`
    SELECT s.name, COUNT(*) as cnt, COALESCE(SUM(r.total_price), 0) as revenue
    FROM rentals r
    CROSS JOIN LATERAL jsonb_array_elements_text(r.equipment_ids) AS eid
    JOIN services s ON s.id = eid::uuid
    WHERE r.status IN ('completed','returned','closed','active')
      AND r.equipment_ids IS NOT NULL AND jsonb_typeof(r.equipment_ids) = 'array'
    GROUP BY s.name
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.log('\nEquipment from services:');
  console.table(eqBreakdown.rows);

  // 4. Created-by staff breakdown
  const staff = await pool.query(`
    SELECT u.first_name || ' ' || u.last_name as staff_name, COUNT(*) as cnt, 
      COALESCE(SUM(r.total_price), 0) as revenue
    FROM rentals r
    JOIN users u ON u.id = r.created_by
    WHERE r.status IN ('completed','returned','closed','active')
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY cnt DESC
    LIMIT 10
  `);
  console.log('\nRentals by staff (created_by):');
  console.table(staff.rows);

  await pool.end();
})();
