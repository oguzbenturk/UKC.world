const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

async function check() {
  const s = await pool.query('SELECT status, payment_status, COUNT(*) FROM rentals GROUP BY status, payment_status');
  console.log('Status breakdown:', s.rows);

  const e = await pool.query('SELECT equipment_ids IS NOT NULL as has_eq, COUNT(*) FROM rentals GROUP BY (equipment_ids IS NOT NULL)');
  console.log('Equipment_ids:', e.rows);

  const r = await pool.query('SELECT id, rental_date, start_date, end_date, status, payment_status, equipment_ids, total_price FROM rentals LIMIT 3');
  console.log('Sample rentals:', JSON.stringify(r.rows, null, 2));

  const t = await pool.query("SELECT jsonb_typeof(equipment_ids) as type, COUNT(*) FROM rentals WHERE equipment_ids IS NOT NULL GROUP BY jsonb_typeof(equipment_ids)");
  console.log('Equipment_ids types:', t.rows);

  // Check if equipment_ids has empty arrays
  const empty = await pool.query("SELECT jsonb_array_length(equipment_ids) as len, COUNT(*) FROM rentals WHERE equipment_ids IS NOT NULL AND jsonb_typeof(equipment_ids) = 'array' GROUP BY jsonb_array_length(equipment_ids)");
  console.log('Equipment array lengths:', empty.rows);

  // Check equipment_details
  const ed = await pool.query("SELECT equipment_details IS NOT NULL as has_det, COUNT(*) FROM rentals GROUP BY (equipment_details IS NOT NULL)");
  console.log('Equipment_details:', ed.rows);

  // Sample equipment_details
  const edSample = await pool.query("SELECT equipment_details FROM rentals WHERE equipment_details IS NOT NULL LIMIT 1");
  if (edSample.rows.length) console.log('Equipment_details sample:', JSON.stringify(edSample.rows[0].equipment_details, null, 2));

  await pool.end();
}
check();
