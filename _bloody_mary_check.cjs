const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

const USER_ID = '21764418-1ab1-482b-9b60-5332ee919e91';

async function main() {
  // All wallet transactions
  const txRes = await pool.query(
    `SELECT id, transaction_type, amount, available_delta, direction, status, description, currency, related_entity_id, related_entity_type, transaction_date FROM wallet_transactions WHERE user_id = $1 ORDER BY transaction_date DESC`,
    [USER_ID]
  );
  console.log('=== ALL WALLET TRANSACTIONS ===');
  console.log(JSON.stringify(txRes.rows, null, 2));

  // group_booking participants with package info
  const partRes = await pool.query(
    `SELECT gbp.id, gbp.group_booking_id, gbp.customer_package_id, gbp.payment_status, gbp.amount_due, gbp.currency,
            cp.package_name, cp.total_hours, cp.used_hours, cp.remaining_hours, cp.purchase_price,
            gb.title as group_title, gb.package_id as group_service_package_id,
            sp.name as service_package_name, sp.total_hours as sp_total_hours
     FROM group_booking_participants gbp
     LEFT JOIN customer_packages cp ON cp.id = gbp.customer_package_id
     LEFT JOIN group_bookings gb ON gb.id = gbp.group_booking_id
     LEFT JOIN service_packages sp ON sp.id = gb.package_id
     WHERE gbp.user_id = $1`,
    [USER_ID]
  );
  console.log('\n=== GROUP BOOKING PARTICIPANTS ===');
  console.log(JSON.stringify(partRes.rows, null, 2));

  // Current customer packages
  const pkgRes = await pool.query(
    `SELECT id, package_name, total_hours, used_hours, remaining_hours, purchase_price, currency, status, created_at FROM customer_packages WHERE customer_id = $1 ORDER BY created_at DESC`,
    [USER_ID]
  );
  console.log('\n=== CURRENT PACKAGES ===');
  console.log(JSON.stringify(pkgRes.rows, null, 2));

  // Wallet balance
  const balRes = await pool.query(
    `SELECT currency, available_amount FROM wallet_balances WHERE user_id = $1`,
    [USER_ID]
  );
  console.log('\n=== WALLET BALANCES ===');
  console.log(JSON.stringify(balRes.rows, null, 2));

  await pool.end();
}

main().catch(function(e) { console.error(e.message); process.exit(1); });

