const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // 1. Semi-private service lesson_category_tag
  const svc = await pool.query("SELECT id, name, category, lesson_category_tag, discipline_tag, level_tag FROM services WHERE id = 'ff10e649-1911-42d3-81b5-80f86127645a'");
  console.log('=== SEMI-PRIVATE SERVICE ===');
  svc.rows.forEach(r => console.log(JSON.stringify(r)));

  // 2. Elif's category rates
  const rates = await pool.query("SELECT * FROM instructor_category_rates WHERE instructor_id = 'ba39789a-f957-4125-ac2a-f61fad37b5c4' ORDER BY lesson_category");
  console.log('\n=== ELIF CATEGORY RATES ===');
  rates.rows.forEach(r => console.log(JSON.stringify(r)));

  // 3. Elif's service-specific commissions
  const svcComm = await pool.query("SELECT * FROM instructor_service_commissions WHERE instructor_id = 'ba39789a-f957-4125-ac2a-f61fad37b5c4'");
  console.log('\n=== ELIF SERVICE COMMISSIONS ===');
  svcComm.rows.forEach(r => console.log(JSON.stringify(r)));

  // 4. Elif's default commission
  const defComm = await pool.query("SELECT * FROM instructor_default_commissions WHERE instructor_id = 'ba39789a-f957-4125-ac2a-f61fad37b5c4'");
  console.log('\n=== ELIF DEFAULT COMMISSION ===');
  defComm.rows.forEach(r => console.log(JSON.stringify(r)));

  // 5. All services with their lesson_category_tag
  const allSvc = await pool.query("SELECT id, name, lesson_category_tag FROM services WHERE category = 'lesson' ORDER BY name");
  console.log('\n=== ALL LESSON SERVICES ===');
  allSvc.rows.forEach(r => console.log(JSON.stringify(r)));

  // 6. Actual earnings for last test run (Elif semi-private)
  const earnings = await pool.query("SELECT ie.*, b.booking_type, s.name as service_name, s.lesson_category_tag FROM instructor_earnings ie JOIN bookings b ON b.id = ie.booking_id LEFT JOIN services s ON s.id = b.service_id WHERE ie.instructor_id = 'ba39789a-f957-4125-ac2a-f61fad37b5c4' ORDER BY ie.created_at DESC LIMIT 20");
  console.log('\n=== ELIF RECENT EARNINGS ===');
  earnings.rows.forEach(r => console.log(JSON.stringify({
    booking_id: r.booking_id,
    service: r.service_name,
    tag: r.lesson_category_tag,
    type: r.booking_type,
    commission_type: r.commission_type,
    commission_rate: r.commission_rate,
    duration: r.duration_hours,
    base_amount: r.base_amount,
    earned: r.earned_amount,
  })));

  await pool.end();
})();
