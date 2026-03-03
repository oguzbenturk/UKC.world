import { pool } from './backend/db.js';

try {
  // 1. Check category/subcategory distribution
  const cats = await pool.query(`
    SELECT category, subcategory, COUNT(*) as cnt 
    FROM products 
    WHERE status = 'active' 
    GROUP BY category, subcategory 
    ORDER BY category, cnt DESC
  `);
  console.log('\n=== Products by category/subcategory ===');
  console.table(cats.rows);

  // 2. Check total products per category
  const totals = await pool.query(`
    SELECT category, COUNT(*) as total, 
           COUNT(*) FILTER (WHERE stock_quantity > 0) as in_stock,
           COUNT(*) FILTER (WHERE stock_quantity = 0) as out_of_stock
    FROM products 
    WHERE status = 'active'
    GROUP BY category 
    ORDER BY total DESC
  `);
  console.log('\n=== Totals per category (stock breakdown) ===');
  console.table(totals.rows);

  // 3. Check kitesurf products specifically
  const kite = await pool.query(`
    SELECT id, name, category, subcategory, stock_quantity, is_featured
    FROM products 
    WHERE category = 'kitesurf' AND status = 'active'
    ORDER BY subcategory, name
    LIMIT 20
  `);
  console.log('\n=== Sample kitesurf products ===');
  console.table(kite.rows);

  // 4. Check if there are products with NULL subcategory
  const nullSubs = await pool.query(`
    SELECT category, COUNT(*) as cnt 
    FROM products 
    WHERE status = 'active' AND (subcategory IS NULL OR subcategory = '')
    GROUP BY category 
    ORDER BY cnt DESC
  `);
  console.log('\n=== Products with NULL/empty subcategory ===');
  console.table(nullSubs.rows);

  // 5. Check distinct subcategory values for kitesurf
  const kiteSubs = await pool.query(`
    SELECT DISTINCT subcategory, COUNT(*) as cnt
    FROM products 
    WHERE category = 'kitesurf' AND status = 'active'
    GROUP BY subcategory
    ORDER BY subcategory
  `);
  console.log('\n=== Distinct kitesurf subcategories ===');
  console.table(kiteSubs.rows);

} catch (err) {
  console.error('Error:', err.message);
} finally {
  await pool.end();
}
