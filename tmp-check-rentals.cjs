require('dotenv').config({ path: 'backend/.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // First, update rental_segment for ALL services that are missing it
  const updates = [
    // SLS services
    { pattern: '%SLS%Full Equipment%', segment: 'sls' },
    // D/LAB services  
    { pattern: '%D/LAB%Full Equipment%', segment: 'dlab' },
    // Standard - explicit "Standart" in name
    { pattern: '%Standart%Full Equipment%', segment: 'standard' },
    // "Half Day Full Equipment" - no tier marker = standard
    { pattern: '%Half Day Full Equipment%', segment: 'standard' },
  ];

  for (const { pattern, segment } of updates) {
    const res = await pool.query(
      `UPDATE services SET rental_segment = $1 WHERE name ILIKE $2 AND (rental_segment IS NULL OR rental_segment = '') RETURNING id, name, rental_segment`,
      [segment, pattern]
    );
    if (res.rows.length > 0) {
      res.rows.forEach(r => console.log(`  Updated: [${r.rental_segment}] ${r.name}`));
    }
  }

  // Now show the final state
  const { rows } = await pool.query(`
    SELECT id, name, category, rental_segment, discipline_tag, duration, price
    FROM services
    WHERE category ILIKE '%rent%' OR category ILIKE '%equip%'
    ORDER BY rental_segment NULLS LAST, name
  `);
  console.log(`\nFinal state - ${rows.length} rental services:\n`);
  rows.forEach(r => {
    console.log(`[${r.rental_segment || 'NO-SEG'}] ${r.name} | disc=${r.discipline_tag || '-'} | dur=${r.duration} | price=${r.price}`);
  });
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
