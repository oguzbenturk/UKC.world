const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Check group bookings and their price_per_person
  const r = await pool.query(`
    SELECT gb.id, gb.title, gb.price_per_person, gb.currency, gb.status, gb.package_id,
           sp.name as package_name, sp.price as package_price
    FROM group_bookings gb
    LEFT JOIN service_packages sp ON sp.id = gb.package_id
    ORDER BY gb.created_at DESC
    LIMIT 10
  `);
  console.log('=== Group Bookings ===');
  console.table(r.rows.map(row => ({
    id: row.id.substring(0, 8),
    title: (row.title || '').substring(0, 30),
    price_per_person: row.price_per_person,
    currency: row.currency,
    status: row.status,
    pkg_name: (row.package_name || '').substring(0, 25),
    pkg_price: row.package_price
  })));

  // Find the 0-amount group bookings from wallet transactions
  const wt = await pool.query(`
    SELECT wt.related_entity_id, wt.amount, wt.available_delta, wt.user_id, u.email
    FROM wallet_transactions wt
    LEFT JOIN users u ON u.id = wt.user_id
    WHERE wt.related_entity_type = 'group_booking'
      AND wt.amount = 0
  `);
  console.log('\n=== Zero-Amount Wallet Transactions ===');
  for (const row of wt.rows) {
    console.log(`User: ${row.email}, Group: ${row.related_entity_id}`);
    // Check that group's price
    const gb = await pool.query('SELECT price_per_person, package_id FROM group_bookings WHERE id = $1', [row.related_entity_id]);
    if (gb.rows.length > 0) {
      console.log(`  price_per_person: ${gb.rows[0].price_per_person}, package_id: ${gb.rows[0].package_id}`);
    }
    // Check participant's amount_due
    const p = await pool.query('SELECT amount_due, amount_paid, payment_status FROM group_booking_participants WHERE group_booking_id = $1 AND user_id = $2', [row.related_entity_id, row.user_id]);
    if (p.rows.length > 0) {
      console.log(`  participant amount_due: ${p.rows[0].amount_due}, amount_paid: ${p.rows[0].amount_paid}`);
    }
  }

  await pool.end();
})();
