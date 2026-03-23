const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Verify customer_packages for group booking participants
  const cp = await p.query(`
    SELECT cp.customer_id, cp.package_name, cp.total_hours, cp.remaining_hours, cp.status, cp.purchase_price, u.name
    FROM customer_packages cp
    LEFT JOIN users u ON u.id = cp.customer_id
    WHERE cp.notes LIKE '%Group booking%' OR cp.notes LIKE '%Backfill%'
    ORDER BY cp.created_at DESC
  `);
  console.log('=== Customer packages from group bookings ===');
  console.table(cp.rows);

  // Verify amount_paid is no longer NaN
  const amounts = await p.query(`
    SELECT p.user_id, u.name, p.amount_paid, p.payment_status
    FROM group_booking_participants p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.payment_status = 'paid'
  `);
  console.log('\n=== Paid participant amounts ===');
  console.table(amounts.rows);

  await p.end();
}
run().catch(e => { console.error(e); p.end(); });
