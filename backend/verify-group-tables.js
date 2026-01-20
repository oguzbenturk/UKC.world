import { pool } from './db.js';

try {
  const client = await pool.connect();
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('group_bookings', 'group_booking_participants')
    ORDER BY table_name
  `);
  
  console.log('✅ Group booking tables found:');
  result.rows.forEach(row => console.log(`  - ${row.table_name}`));
  
  await client.release();
  await pool.end();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
