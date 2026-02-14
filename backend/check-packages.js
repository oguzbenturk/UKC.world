import { pool } from './db.js';

async function checkPackages() {
  try {
    const result = await pool.query(`
      SELECT 
        sp.id, 
        sp.name, 
        sp.package_type,
        sp.price, 
        sp.sessions_count, 
        sp.total_hours,
        sp.lesson_service_id,
        sp.includes_lessons,
        sp.includes_rental,
        sp.includes_accommodation,
        s.name as linked_service_name,
        s.service_type as linked_service_type
      FROM service_packages sp
      LEFT JOIN services s ON s.id = sp.lesson_service_id
      ORDER BY sp.package_type, sp.name
    `);
    
    console.log('\n=== TOTAL PACKAGES FOUND:', result.rowCount, '===\n');
    
    result.rows.forEach(row => {
      console.log(`
Name: ${row.name}
Type: ${row.package_type || 'N/A'}
Price: €${row.price} | Sessions: ${row.sessions_count} | Total Hours: ${row.total_hours || 'N/A'}
Includes: Lessons=${row.includes_lessons} | Rental=${row.includes_rental} | Accommodation=${row.includes_accommodation}
Linked Service: ${row.linked_service_name || 'NONE'} (${row.linked_service_type || 'N/A'})
ID: ${row.id}
${'='.repeat(80)}`);
    });
    
    pool.end();
  } catch (error) {
    console.error('ERROR:', error.message);
    pool.end();
  }
}

checkPackages();
