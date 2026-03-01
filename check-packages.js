// check-packages.js
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkPackages() {
  try {
    const query = `
      SELECT 
        id, 
        name, 
        package_type, 
        lesson_service_name, 
        lesson_service_id,
        rental_service_name,
        rental_service_id,
        accommodation_unit_name,
        accommodation_unit_id,
        includes_lessons,
        includes_rental,
        includes_accommodation
      FROM service_packages
      WHERE name IN (
        '3 days stay 3 days rental',
        '6h lesson + 3 days of half day rental', 
        '5 days accomodation',
        '3 days rental',
        'All inc. Package',
        'Starter Group Pack',
        'Starter Pack Private'
      )
    `;
    
    const { rows } = await pool.query(query);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkPackages();
