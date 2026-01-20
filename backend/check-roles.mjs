import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkRoles() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Checking available roles in database...\n');
    
    const rolesQuery = 'SELECT id, name FROM roles ORDER BY name';
    const result = await client.query(rolesQuery);
    
    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} roles:\n`);
      result.rows.forEach(role => {
        console.log(`  ${role.name}: ${role.id}`);
      });
    } else {
      console.log('❌ No roles found in database!');
    }
    
    console.log('\n\n🔍 Also checking role_id from error:');
    console.log('  b8073752-02c0-40d6-8cba-24bb7dc95e23');
    
    const checkRole = await client.query(
      'SELECT * FROM roles WHERE id = $1',
      ['b8073752-02c0-40d6-8cba-24bb7dc95e23']
    );
    
    if (checkRole.rows.length > 0) {
      console.log('  ✅ This role EXISTS');
    } else {
      console.log('  ❌ This role does NOT exist');
    }
    
    console.log('\n✅ Check complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkRoles();
