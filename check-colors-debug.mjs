import { pool } from './backend/db.js';

const result = await pool.query(`
  SELECT name, colors, images, image_url
  FROM products 
  WHERE colors IS NOT NULL AND colors != '[]'
  LIMIT 3
`);

result.rows.forEach((row, i) => {
  console.log(`\n=== Product ${i + 1}: ${row.name} ===`);
  console.log('Colors:', JSON.stringify(row.colors, null, 2));
  console.log('Images (first 3):', JSON.stringify(row.images?.slice(0, 3), null, 2));
  console.log('Main image:', row.image_url);
});

process.exit(0);
