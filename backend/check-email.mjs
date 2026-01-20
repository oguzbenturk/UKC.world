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

async function checkEmail() {
  const client = await pool.connect();
  
  try {
    const email = 'bugrabenturk@gmail.com';
    
    console.log(`🔍 Checking for records related to: ${email}\n`);
    
    // First check if user exists
    const userCheck = await client.query(
      'SELECT id, email, deleted_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (userCheck.rows.length > 0) {
      console.log('✅ User exists in users table:');
      userCheck.rows.forEach(row => {
        console.log(`   ID: ${row.id}`);
        console.log(`   Email: ${row.email}`);
        console.log(`   Deleted: ${row.deleted_at || 'No (active)'}`);
      });
    } else {
      console.log('❌ User NOT found in users table');
      console.log('   This means the email should be available for new registration');
    }
    
    console.log('\n✅ Check complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkEmail();
