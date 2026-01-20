import { pool } from './db.js';

async function main() {
  // Add image columns
  await pool.query('ALTER TABLE accommodation_units ADD COLUMN IF NOT EXISTS image_url TEXT');
  console.log('Added image_url column');
  
  await pool.query("ALTER TABLE accommodation_units ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb");
  console.log('Added images column');
  
  // Verify columns
  const r1 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'accommodation_units' ORDER BY ordinal_position");
  console.log('\naccommodation_units columns:');
  r1.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}`));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
