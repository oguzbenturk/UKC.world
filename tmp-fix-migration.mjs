import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

// Check products by new categories
const r1 = await pool.query("SELECT category, subcategory, COUNT(*) as cnt FROM products WHERE category IN ('foiling', 'efoil') GROUP BY category, subcategory ORDER BY category, subcategory");
console.log('Products by category:');
r1.rows.forEach(r => console.log(`  ${r.category} / ${r.subcategory}: ${r.cnt}`));

// Check product_subcategories
const r2 = await pool.query("SELECT category, subcategory, display_name FROM product_subcategories WHERE category IN ('foiling', 'efoil') ORDER BY category, display_order");
console.log('\nSubcategory records:');
r2.rows.forEach(r => console.log(`  ${r.category} / ${r.subcategory}: ${r.display_name}`));

await pool.end();
