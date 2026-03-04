import { pool } from './backend/db.js';
const r = await pool.query(`SELECT id, name, duration, service_type, category, rental_segment FROM services WHERE LOWER(COALESCE(service_type,'')) LIKE '%rental%' OR LOWER(COALESCE(category,'')) LIKE '%rental%' OR LOWER(COALESCE(name,'')) LIKE '%rental%' LIMIT 10`);
console.log(JSON.stringify(r.rows, null, 2));

// Also check what bookings look like for these services
if (r.rows.length > 0) {
  const svcIds = r.rows.map(s => s.id);
  const b = await pool.query(`SELECT b.id, b.date, b.start_hour, b.duration, b.status, b.notes, srv.name as service_name, srv.duration as service_duration FROM bookings b JOIN services srv ON srv.id = b.service_id WHERE b.service_id = ANY($1) LIMIT 10`, [svcIds]);
  console.log('\nRental bookings:');
  console.log(JSON.stringify(b.rows, null, 2));
}

process.exit(0);
