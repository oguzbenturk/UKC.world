import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'plannivo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT id, name, package_type, sessions_count, price, currency
      FROM service_packages
      WHERE name ILIKE '%starter%group%' OR name ILIKE '%group%starter%'
    `);
    console.log('Found packages:', JSON.stringify(result.rows, null, 2));
    
    // Also check all packages with 'starter' in name
    const result2 = await pool.query(`
      SELECT id, name, package_type, sessions_count, price, currency
      FROM service_packages
      WHERE name ILIKE '%starter%'
      ORDER BY name
    `);
    console.log('\nAll starter packages:', JSON.stringify(result2.rows, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
