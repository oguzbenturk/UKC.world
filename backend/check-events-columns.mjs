import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL,
});

async function checkColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'events'
      ORDER BY ordinal_position
    `);
    
    console.log('Events table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    const hasDeletedAt = result.rows.some(row => row.column_name === 'deleted_at');
    const hasImageUrl = result.rows.some(row => row.column_name === 'image_url');
    
    console.log('\nColumn check:');
    console.log(`  deleted_at: ${hasDeletedAt ? '✓ EXISTS' : '✗ MISSING'}`);
    console.log(`  image_url: ${hasImageUrl ? '✓ EXISTS' : '✗ MISSING'}`);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkColumns();
