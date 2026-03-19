const dotenv = require('dotenv');
dotenv.config({ path: './backend/.env' });
const { Client } = require('pg');

(async () => {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();

  // All FKs referencing users
  const r = await c.query(`
    SELECT kcu.table_name, kcu.column_name, c.is_nullable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    LEFT JOIN information_schema.columns c
      ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name AND c.table_schema = 'public'
    WHERE tc.table_schema = 'public' 
      AND tc.constraint_type = 'FOREIGN KEY' 
      AND ccu.table_name = 'users'
    ORDER BY kcu.table_name, kcu.column_name
  `);

  console.log('=== ALL FK REFERENCES TO users TABLE ===');
  r.rows.forEach(row => {
    const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
    console.log(`  ${row.table_name}.${row.column_name} ${nullable}`);
  });
  console.log('TOTAL:', r.rows.length);

  // Tables currently handled in cleanup script
  const handled = new Set([
    'liability_waivers.user_id',
    'instructor_earnings.instructor_id',
    'booking_series_customers.customer_user_id',
    'booking_series.instructor_user_id',
    'wallet_transactions.user_id',
    'wallet_balances.user_id',
    'transactions.user_id',
    'notifications.user_id',
    'user_consents.user_id',
    'instructor_services.instructor_id',
    'financial_events.user_id',
    'student_accounts.user_id',
    'instructor_service_commissions.instructor_id',
    'event_registrations.user_id',
    'instructor_payroll.instructor_id',
    'student_progress.student_id',
    'student_progress.instructor_id',
    'accommodation_bookings.guest_id',
    'security_audit.user_id',
    'api_keys.user_id',
    'voucher_redemptions.user_id',
    'quick_link_registrations.user_id',
    'form_submissions.user_id',
    'manager_salary_records.manager_user_id',
    'service_revenue_ledger.customer_id',
    'rentals.user_id',
    'customer_packages.customer_id',
    'family_members.parent_user_id',
    'member_purchases.user_id',
    'manager_commissions.manager_user_id',
    'bookings.student_user_id',
    'bookings.instructor_user_id',
    'bookings.customer_user_id',
    'audit_logs.user_id',
    'audit_logs.target_user_id',
    'audit_logs.actor_user_id',
    'shop_order_status_history.changed_by',
    'shop_orders.user_id',
    'shop_order_items.order_id', // indirect
  ]);

  console.log('\n=== MISSING FROM CLEANUP SCRIPT ===');
  let missing = 0;
  r.rows.forEach(row => {
    const key = `${row.table_name}.${row.column_name}`;
    if (!handled.has(key)) {
      const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log(`  MISSING: ${key} ${nullable}`);
      missing++;
    }
  });
  console.log(`Total missing: ${missing}`);

  await c.end();
})();
