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

// Simulate the /api/services/packages endpoint query
(async () => {
  try {
    const query = `
      SELECT p.*
      FROM service_packages p
      WHERE 1=1
      ORDER BY p.created_at DESC
    `;
    
    const { rows } = await pool.query(query);
    
    console.log(`Total packages found: ${rows.length}\n`);
    
    // Check for Starter Group Pack specifically
    const starterGroupPack = rows.find(r => r.name === 'Starter Group Pack');
    
    if (starterGroupPack) {
      console.log('✅ Starter Group Pack FOUND in query results:');
      console.log(JSON.stringify(starterGroupPack, null, 2));
    } else {
      console.log('❌ Starter Group Pack NOT FOUND in query results');
      console.log('\nPackages with "starter" in name:');
      const starterPacks = rows.filter(r => r.name.toLowerCase().includes('starter'));
      console.log(starterPacks.map(p => ({ id: p.id, name: p.name })));
    }
    
    // Show all group packages
    console.log('\n\nAll packages with "group" in name:');
    const groupPacks = rows.filter(r => r.name.toLowerCase().includes('group'));
    console.log(groupPacks.map(p => ({ id: p.id, name: p.name })));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();
