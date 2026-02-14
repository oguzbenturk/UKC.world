import { pool } from './db.js';

async function checkServices() {
  try {
    const result = await pool.query(`
      SELECT id, name, service_type, category, level, price, duration, max_participants 
      FROM services 
      ORDER BY service_type, name
    `);
    
    console.log('\n=== TOTAL SERVICES FOUND:', result.rowCount, '===\n');
    
    result.rows.forEach(row => {
      console.log(`
Name: ${row.name}
Type: ${row.service_type} | Category: ${row.category} | Level: ${row.level}
Price: €${row.price} | Duration: ${row.duration}h | Max Participants: ${row.max_participants}
ID: ${row.id}
${'='.repeat(80)}`);
    });
    
    pool.end();
  } catch (error) {
    console.error('ERROR:', error.message);
    pool.end();
  }
}

checkServices();
