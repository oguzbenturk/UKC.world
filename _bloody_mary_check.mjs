import pool from './backend/db.js';

// Find Bloody Mary
const userRes = await pool.query(
  "SELECT id, email, first_name, last_name, preferred_currency FROM users WHERE email ILIKE $1 OR first_name ILIKE $2 OR last_name ILIKE $3",
  ['%bloody%', '%blood%', '%mary%']
);
console.log('=== USER ===');
console.log(JSON.stringify(userRes.rows, null, 2));

if (userRes.rows.length === 0) {
  console.log('No user found');
  await pool.end();
  process.exit(0);
}

const userId = userRes.rows[0].id;

// Get wallet transactions
const txRes = await pool.query(
  `SELECT id, transaction_type, amount, available_delta, direction, status, description, currency, related_entity_id, related_entity_type, transaction_date
   FROM wallet_transactions WHERE user_id = $1 ORDER BY transaction_date DESC`,
  [userId]
);
console.log('\n=== WALLET TRANSACTIONS ===');
console.log(JSON.stringify(txRes.rows, null, 2));

// Get customer packages
const pkgRes = await pool.query(
  `SELECT id, package_name, total_hours, used_hours, remaining_hours, purchase_price, currency, status, notes, created_at
   FROM customer_packages WHERE customer_id = $1 ORDER BY created_at DESC`,
  [userId]
);
console.log('\n=== CUSTOMER PACKAGES ===');
console.log(JSON.stringify(pkgRes.rows, null, 2));

// Get wallet balance
const balRes = await pool.query(
  `SELECT currency, available_amount, pending_amount FROM wallet_balances WHERE user_id = $1`,
  [userId]
);
console.log('\n=== WALLET BALANCES ===');
console.log(JSON.stringify(balRes.rows, null, 2));

await pool.end();
