const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  const companyId = 'f4dbacbe-41c2-4e2c-90b5-9b45e0160218';
  
  // Check zero vs paid bookings per instructor
  const r = await pool.query(`
    SELECT u.first_name || ' ' || u.last_name as name,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0) = 0) as zero_amount,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0) > 0) as paid,
      COUNT(*) as total,
      COALESCE(SUM(b.duration), 0) as total_hours,
      COALESCE(SUM(b.duration) FILTER (WHERE COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0) = 0), 0) as zero_hours,
      COALESCE(SUM(b.duration) FILTER (WHERE COALESCE(NULLIF(b.final_amount,0), NULLIF(b.amount,0), 0) > 0), 0) as paid_hours
    FROM bookings b 
    JOIN users u ON u.id = b.instructor_user_id
    WHERE b.status = 'completed' AND b.service_type = 'lesson' AND b.deleted_at IS NULL
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY name
  `, []);
  
  console.log('Zero vs Paid bookings per instructor:');
  console.table(r.rows);
  
  await pool.end();
})();
