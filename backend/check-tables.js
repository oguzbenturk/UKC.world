import pool from './db.js';

(async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('\n📋 Tables in database:');
    res.rows.forEach(row => console.log('  -', row.table_name));
    console.log('\nTotal tables:', res.rows.length);
  } finally {
    client.release();
    process.exit();
  }
})();
