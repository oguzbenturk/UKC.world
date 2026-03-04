import { pool } from './backend/db.js';
const r = await pool.query(`
  SELECT column_name, data_type, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'rentals' 
  ORDER BY ordinal_position
`);
console.log('rentals table columns:');
r.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`));

// Also check rental_equipment table
const re = await pool.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns 
  WHERE table_name = 'rental_equipment' 
  ORDER BY ordinal_position
`);
console.log('\nrental_equipment table columns:');
re.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`));

process.exit(0);
