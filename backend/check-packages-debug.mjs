import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkPackages() {
  try {
    console.log('Checking service_packages table...\n');
    
    const packagesResult = await pool.query(`
      SELECT 
        sp.id,
        sp.name as package_name,
        sp.lesson_service_name,
        sp.total_hours,
        sp.sessions_count,
        s.name as linked_service_name,
        s.service_type
      FROM service_packages sp
      LEFT JOIN services s ON s.package_id = sp.id
      ORDER BY sp.created_at DESC
      LIMIT 10
    `);
    
    console.log('Packages found:', packagesResult.rows.length);
    packagesResult.rows.forEach((pkg, i) => {
      console.log(`\n${i + 1}. ${pkg.package_name}`);
      console.log(`   lesson_service_name: "${pkg.lesson_service_name || 'NULL'}"`);
      console.log(`   linked_service_name: "${pkg.linked_service_name || 'NULL'}"`);
      console.log(`   service_type: "${pkg.service_type || 'NULL'}"`);
      console.log(`   total_hours: ${pkg.total_hours || 'NULL'}`);
      console.log(`   sessions_count: ${pkg.sessions_count || 'NULL'}`);
    });
    
    console.log('\n\nChecking services table...\n');
    
    const servicesResult = await pool.query(`
      SELECT id, name, service_type, package_id
      FROM services
      WHERE service_type IN ('private', 'group', 'semi-private')
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log('Services found:', servicesResult.rows.length);
    servicesResult.rows.forEach((svc, i) => {
      console.log(`\n${i + 1}. ${svc.name}`);
      console.log(`   service_type: ${svc.service_type}`);
      console.log(`   has_package: ${svc.package_id ? 'YES' : 'NO'}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPackages();
