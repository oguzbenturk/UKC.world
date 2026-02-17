import { pool } from './db.js';

async function testPackageQuery() {
  try {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.package_type,
        p.lesson_service_id,
        p.rental_service_id,
        p.accommodation_unit_id,
        ls.name as linked_lesson_service_name,
        rs.name as linked_rental_service_name,
        au.name as linked_accommodation_unit_name
      FROM service_packages p
      LEFT JOIN services ls ON ls.id = p.lesson_service_id
      LEFT JOIN services rs ON rs.id = p.rental_service_id
      LEFT JOIN accommodation_units au ON au.id = p.accommodation_unit_id
      ORDER BY p.created_at DESC
    `;
    
    const { rows } = await pool.query(query);
    
    console.log('\n=== PACKAGES WITH SERVICE NAMES ===\n');
    
    rows.forEach(row => {
      console.log(`Package: ${row.name}`);
      console.log(`  Type: ${row.package_type}`);
      console.log(`  Lesson Service: ${row.linked_lesson_service_name || 'None'} (ID: ${row.lesson_service_id || 'null'})`);
      console.log(`  Rental Service: ${row.linked_rental_service_name || 'None'} (ID: ${row.rental_service_id || 'null'})`);
      console.log(`  Accommodation: ${row.linked_accommodation_unit_name || 'None'} (ID: ${row.accommodation_unit_id || 'null'})`);
      console.log('---');
    });
    
    pool.end();
  } catch (error) {
    console.error('ERROR:', error.message);
    pool.end();
  }
}

testPackageQuery();
