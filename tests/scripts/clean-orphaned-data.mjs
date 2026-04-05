#!/usr/bin/env node
/**
 * Full cleanup: delete all test customers + orphaned bookings/earnings.
 *
 * Usage:
 *   node tests/functionality-tests/_clean_orphaned_earnings.mjs          # dry run
 *   node tests/functionality-tests/_clean_orphaned_earnings.mjs --delete # actually delete
 */
import pg from 'pg';

const doDelete = process.argv.includes('--delete');
const c = new pg.Client(process.env.DATABASE_URL || 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo');
await c.connect();

// Known test user IDs (both existing and ghost)
const testUserIds = [
  'd592fcb7-1eec-4fdf-aadd-aba4a0ed0e51', // Laura Fischer (ghost)
  '90fc42db-5666-48e3-b3d3-e09eaeb4db23', // Sophie Müller
  '11d025d3-0876-4eb8-9708-9c926c67a5bc', // Tobias Schneider
  '24e23a46-b85e-428c-830a-e0d14f0f3910', // Lukas Hoffmann
  '7009efb6-2abd-4a71-bfbe-20b3e500e1b1', // Ozan Öztürk (ghost)
  '933c0629-c156-4809-99eb-d69c597499e3', // Maximilian Weber
];

// Also find any test profile emails (including soft-deleted with anonymized emails)
const testEmails = [
  'lukas.hoffmann87@gmail.com', 'sophie.mueller92@gmail.com',
  'tobias.schneider85@gmail.com', 'laura.fischer95@gmail.com',
  'max.weber1990@gmail.com',
];
const emailUsers = await c.query(
  `SELECT id, email, first_name, last_name, deleted_at FROM users WHERE email = ANY($1) OR original_email = ANY($1) OR id = ANY($2)`,
  [testEmails, testUserIds]
);

const allIds = new Set(testUserIds);
for (const u of emailUsers.rows) allIds.add(u.id);

console.log(`\nFound ${emailUsers.rows.length} user record(s) in DB:`);
for (const u of emailUsers.rows) {
  console.log(`  ${u.first_name} ${u.last_name} (${u.email}) ${u.deleted_at ? '[soft-deleted]' : '[active]'}`);
}

// Count orphaned data
const bookings = await c.query(
  `SELECT COUNT(*) as cnt FROM bookings WHERE customer_user_id = ANY($1) OR student_user_id = ANY($1)`,
  [[...allIds]]
);
const earnings = await c.query(
  `SELECT COUNT(*) as cnt FROM instructor_earnings WHERE booking_id IN (SELECT id FROM bookings WHERE customer_user_id = ANY($1) OR student_user_id = ANY($1))`,
  [[...allIds]]
);
const walletTx = await c.query(
  `SELECT COUNT(*) as cnt FROM wallet_transactions WHERE user_id = ANY($1)`,
  [[...allIds]]
);
const walletBal = await c.query(
  `SELECT COUNT(*) as cnt FROM wallet_balances WHERE user_id = ANY($1)`,
  [[...allIds]]
);
const pkgs = await c.query(
  `SELECT COUNT(*) as cnt FROM customer_packages WHERE customer_id = ANY($1)`,
  [[...allIds]]
);
const financialEvt = await c.query(
  `SELECT COUNT(*) as cnt FROM financial_events WHERE user_id = ANY($1)`,
  [[...allIds]]
);
const srl = await c.query(
  `SELECT COUNT(*) as cnt FROM service_revenue_ledger WHERE customer_id = ANY($1)`,
  [[...allIds]]
);

console.log(`\nData to clean:`);
console.log(`  Bookings:             ${bookings.rows[0].cnt}`);
console.log(`  Instructor earnings:  ${earnings.rows[0].cnt}`);
console.log(`  Wallet transactions:  ${walletTx.rows[0].cnt}`);
console.log(`  Wallet balances:      ${walletBal.rows[0].cnt}`);
console.log(`  Customer packages:    ${pkgs.rows[0].cnt}`);
console.log(`  Financial events:     ${financialEvt.rows[0].cnt}`);
console.log(`  Revenue ledger:       ${srl.rows[0].cnt}`);
console.log(`  User records:         ${emailUsers.rows.length}`);

if (!doDelete) {
  console.log(`\nDry run — pass --delete to actually remove everything.`);
  await c.end();
  process.exit(0);
}

// Delete in correct order
await c.query('BEGIN');
try {
  const ids = [...allIds];

  // Earnings first (depends on bookings)
  await c.query(`DELETE FROM instructor_earnings WHERE booking_id IN (SELECT id FROM bookings WHERE customer_user_id = ANY($1) OR student_user_id = ANY($1))`, [ids]);

  // Waivers
  await c.query(`DELETE FROM liability_waivers WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM liability_waivers WHERE family_member_id IN (SELECT id FROM family_members WHERE parent_user_id = ANY($1))`, [ids]);

  // All related tables
  await c.query(`DELETE FROM wallet_transactions WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM wallet_balances WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM transactions WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM financial_events WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM service_revenue_ledger WHERE customer_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM user_consents WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM student_accounts WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM event_registrations WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM security_audit WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM api_keys WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM voucher_redemptions WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM quick_link_registrations WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM form_submissions WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM instructor_payroll WHERE instructor_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM student_progress WHERE student_id = ANY($1) OR instructor_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM instructor_services WHERE instructor_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM instructor_service_commissions WHERE instructor_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM booking_series_customers WHERE customer_user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM booking_series WHERE instructor_user_id = ANY($1) OR created_by = ANY($1)`, [ids]);
  await c.query(`DELETE FROM accommodation_bookings WHERE guest_id = ANY($1) OR created_by = ANY($1)`, [ids]);
  await c.query(`DELETE FROM manager_salary_records WHERE manager_user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM member_purchases WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR target_user_id = ANY($1) OR actor_user_id = ANY($1)`, [ids]);

  // Bookings + packages
  await c.query(`DELETE FROM bookings WHERE customer_user_id = ANY($1) OR student_user_id = ANY($1) OR instructor_user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM customer_packages WHERE customer_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM rentals WHERE user_id = ANY($1)`, [ids]);
  await c.query(`DELETE FROM family_members WHERE parent_user_id = ANY($1)`, [ids]);

  // Nullify shared refs
  await c.query(`UPDATE products SET created_by = NULL WHERE created_by = ANY($1)`, [ids]);
  await c.query(`UPDATE products SET updated_by = NULL WHERE updated_by = ANY($1)`, [ids]);

  // Finally delete the user records
  const del = await c.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);

  await c.query('COMMIT');
  console.log(`\n✅ Cleaned up all data. Deleted ${del.rowCount} user record(s).`);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('\n❌ Error:', err.message);
}

await c.end();
