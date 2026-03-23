const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Check recent group booking participants
  const r = await pool.query(`
    SELECT p.id, p.user_id, p.status, p.payment_status, p.payment_method,
           p.amount_due, p.amount_paid, p.currency, p.is_organizer,
           u.email, roles.name as role_name
    FROM group_booking_participants p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN roles ON roles.id = u.role_id
    ORDER BY p.created_at DESC
    LIMIT 10
  `);
  console.log('=== Recent Group Booking Participants ===');
  console.table(r.rows.map(row => ({
    email: row.email,
    status: row.status,
    pay_status: row.payment_status,
    pay_method: row.payment_method,
    amount_due: row.amount_due,
    amount_paid: row.amount_paid,
    currency: row.currency,
    is_org: row.is_organizer,
    role: row.role_name
  })));

  // Check wallet transactions for group bookings
  const wt = await pool.query(`
    SELECT wt.user_id, u.email, wt.amount, wt.available_delta, wt.currency,
           wt.transaction_type, wt.related_entity_type, wt.description,
           wt.created_at
    FROM wallet_transactions wt
    LEFT JOIN users u ON u.id = wt.user_id
    WHERE wt.related_entity_type = 'group_booking'
    ORDER BY wt.created_at DESC
    LIMIT 10
  `);
  console.log('\n=== Wallet Transactions for Group Bookings ===');
  console.table(wt.rows.map(row => ({
    email: row.email,
    amount: row.amount,
    delta: row.available_delta,
    currency: row.currency,
    type: row.transaction_type,
    desc: row.description?.substring(0, 50),
    date: row.created_at
  })));

  await pool.end();
})();
