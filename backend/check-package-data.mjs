import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://plannivo:WHMgux86@plannivo.com:5432/plannivo',
  ssl: false
});

async function checkPackage() {
  try {
    // Find the package with "3 days" in the name
    const result = await pool.query(`
      SELECT id, package_name, 
             total_hours, used_hours, remaining_hours,
             rental_days_total, rental_days_used, rental_days_remaining,
             includes_rental, includes_lessons, package_type,
             rental_service_name
      FROM customer_packages
      WHERE package_name LIKE '%3 days%' OR package_name LIKE '%rental%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log('Found packages:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0) {
      const pkg = result.rows[0];
      console.log(`\n📦 Package: ${pkg.package_name}`);
      console.log(`   Lesson hours: ${pkg.total_hours}`);
      console.log(`   Rental days: ${pkg.rental_days_total || 0}`);
      console.log(`   Includes rental: ${pkg.includes_rental}`);
      console.log(`   Package type: ${pkg.package_type}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPackage();
