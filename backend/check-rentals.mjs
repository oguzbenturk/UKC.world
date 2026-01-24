import { pool } from './db.js';

async function checkRentals() {
  try {
    // Check for rental services
    const result = await pool.query(`
      SELECT id, name, service_type, category 
      FROM services 
      WHERE service_type = 'rental' 
         OR category ILIKE '%rental%' 
         OR name ILIKE '%rental%'
    `);
    
    console.log('=== Rental Services Found ===');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // Also check all distinct service_types
    const types = await pool.query(`SELECT DISTINCT service_type FROM services`);
    console.log('\n=== All Service Types ===');
    console.log(types.rows.map(r => r.service_type));
    
    // Check all distinct categories
    const cats = await pool.query(`SELECT DISTINCT category FROM services`);
    console.log('\n=== All Categories ===');
    console.log(cats.rows.map(r => r.category));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkRentals();
