const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function main() {
  // Check ALL bookings from March 23+ (where group bookings are)
  const result = await pool.query(`
    SELECT b.id, TO_CHAR(b.date, 'YYYY-MM-DD') as formatted_date, b.status, b.start_hour,
           b.instructor_user_id, b.student_user_id, b.deleted_at,
           srv.name as service_name
    FROM bookings b
    LEFT JOIN services srv ON srv.id = b.service_id
    WHERE b.date >= '2026-03-23' AND b.date <= '2026-03-25'
    ORDER BY b.date, b.start_hour
  `);
  console.log('=== ALL BOOKINGS Mar 23-25 (including deleted) ===');
  for (const r of result.rows) {
    console.log(r.id.slice(0,8), r.formatted_date, r.status, 'start_hour:', r.start_hour, '| deleted:', r.deleted_at ? 'YES' : 'no', '|', r.service_name);
  }
  console.log('Total:', result.rows.length);
  
  pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
