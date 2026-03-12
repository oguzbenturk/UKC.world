import { pool } from './db.js';

// ============================================================
// DATABASE RESET SCRIPT
// Keeps: admin+manager users, roles, schema_migrations,
//        settings, currency_settings, legal_documents,
//        form templates/fields/steps, form submissions,
//        form analytics, marketing, vouchers, quick_links
// Deletes: everything else (catalog, transactional, users)
//
// ⚠ Run _db_backup.js FIRST!
// ============================================================

const ADMIN_USER_ID = '9f64cebb-8dd0-4ff3-be66-77beb73b0750';   // System Administrator
const MANAGER_USER_ID = 'e001e942-710e-43c6-b8af-5a5aa795c65f'; // Oguzhan Bentürk

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
  const client = await pool.connect();

  try {
    if (DRY_RUN) {
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║        DRY RUN MODE — No changes applied        ║');
      console.log('║     Run with --execute to apply for real         ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║     ⚠  LIVE EXECUTION — Changes will apply!     ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
    }

    await client.query('BEGIN');

    // ── Step 1: Reassign ownership in KEPT tables ──────────────
    console.log('── Step 1: Reassigning created_by/updated_by in kept tables ──');

    const reassignQueries = [
      { table: 'form_templates',      cols: ['created_by'] },
      { table: 'voucher_codes',       cols: ['created_by'] },
      { table: 'marketing_campaigns', cols: ['created_by'] },
      { table: 'quick_links',         cols: ['created_by'] },
      { table: 'waiver_versions',     cols: ['created_by'] },
    ];

    for (const { table, cols } of reassignQueries) {
      for (const col of cols) {
        const sql = `UPDATE ${table} SET ${col} = $1 WHERE ${col} IS NOT NULL AND ${col} NOT IN ($1, $2)`;
        const result = await client.query(sql, [ADMIN_USER_ID, MANAGER_USER_ID]);
        if (result.rowCount > 0) {
          console.log(`  ${table}.${col}: ${result.rowCount} rows → admin`);
        }
      }
    }
    console.log('  Done.\n');

    // ── Step 2: Truncate all transactional tables ──────────────
    console.log('── Step 2: Truncating transactional tables ──');

    const truncateTables = [
      // Catalog (services, products, packages, equipment, accommodation)
      'services',
      'service_categories',
      'service_packages',
      'service_prices',
      'package_prices',
      'products',
      'product_subcategories',
      'equipment',
      'rental_equipment',
      'accommodation_units',
      'member_offerings',

      // Bookings
      'accommodation_bookings',
      'booking_custom_commissions',
      'booking_equipment',
      'booking_participants',
      'booking_reschedule_notifications',
      'booking_series',
      'booking_series_customers',
      'bookings',

      // Customer packages & purchases
      'customer_packages',
      'member_purchases',

      // Shop orders
      'shop_order_items',
      'shop_order_messages',
      'shop_order_status_history',
      'shop_orders',

      // Rentals
      'rentals',

      // Events
      'events',
      'event_registrations',

      // Financial / earnings
      'financial_events',
      'service_revenue_ledger',
      'revenue_items',
      'transactions',
      'refunds',
      'business_expenses',
      'financial_settings',
      'financial_settings_overrides',
      'earnings_audit_log',
      'instructor_commission_history',
      'instructor_default_commissions',
      'instructor_earnings',
      'instructor_payroll',
      'instructor_rate_history',
      'instructor_ratings',
      'instructor_service_commissions',
      'instructor_services',
      'instructor_student_notes',
      'manager_commission_settings',
      'manager_commissions',
      'manager_payout_items',
      'manager_payouts',

      // Wallet
      'wallet_transactions',
      'wallet_deposit_requests',
      'wallet_balances',
      'wallet_audit_logs',
      'wallet_bank_accounts',
      'wallet_export_jobs',
      'wallet_kyc_documents',
      'wallet_notification_delivery_logs',
      'wallet_notification_preferences',
      'wallet_payment_methods',
      'wallet_promotions',
      'wallet_settings',
      'wallet_withdrawal_requests',

      // Communication
      'notifications',
      'notification_settings',
      'messages',
      'message_reactions',
      'conversations',
      'conversation_participants',
      'push_subscriptions',

      // Form transactional (NOT templates/fields/steps/submissions/analytics — those stay)
      'form_email_logs',
      'form_email_notifications',
      'form_quick_action_tokens',
      'form_template_versions',

      // User data (will be deleted with users)
      'user_consents',
      'user_popup_preferences',
      'user_preferences',
      'user_relationships',
      'user_sessions',
      'user_vouchers',
      'voucher_redemptions',
      'family_members',
      'liability_waivers',
      'student_accounts',
      'student_achievements',
      'student_progress',
      'student_support_requests',
      'password_reset_tokens',
      'api_keys',
      'feedback',
      'skill_levels',
      'skills',

      // Payments
      'payment_gateway_webhook_events',
      'payment_intents',

      // Logs (transactional — can be regenerated)
      'audit_logs',
      'security_audit',
      'currency_update_logs',

      // Popup system
      'popup_analytics',
      'popup_configurations',
      'popup_content_blocks',
      'popup_media_assets',
      'popup_targeting_rules',
      'popup_templates',
      'popup_user_interactions',

      // Misc transactional
      'quick_link_registrations',
      'recommended_products',
      'repair_request_comments',
      'repair_requests',
      'spare_parts_orders',
      'group_booking_participants',
      'group_bookings',
      'group_lesson_requests',
      'package_hour_fixes',

      // Archives / backups
      'archive_legacy_transactions',
      'archive_student_accounts',
      'deleted_booking_relations_backup',
      'deleted_bookings_backup',
      'deleted_entities_backup',
    ];

    // Pre-count rows
    let totalRows = 0;
    for (const t of truncateTables) {
      const { rows } = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
      const count = parseInt(rows[0].c);
      if (count > 0) {
        console.log(`  ${t}: ${count} rows`);
        totalRows += count;
      }
    }

    await client.query(`TRUNCATE TABLE ${truncateTables.join(', ')} CASCADE`);
    console.log(`  → Truncated ${truncateTables.length} tables (${totalRows} total rows)\n`);

    // ── Step 3: Delete non-admin/manager users ─────────────────
    console.log('── Step 3: Deleting non-admin users ──');

    // Show who will be deleted
    const toDelete = await client.query(
      `SELECT u.name, u.email, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id NOT IN ($1, $2)
       ORDER BY r.name, u.name`,
      [ADMIN_USER_ID, MANAGER_USER_ID]
    );
    for (const u of toDelete.rows) {
      console.log(`  [DELETE] ${u.name} (${u.email}) [${u.role}]`);
    }

    const deleteResult = await client.query(
      'DELETE FROM users WHERE id NOT IN ($1, $2)',
      [ADMIN_USER_ID, MANAGER_USER_ID]
    );
    console.log(`  → Deleted ${deleteResult.rowCount} users\n`);

    // ── Step 4: Verification ───────────────────────────────────
    console.log('── Step 4: Verification ──');

    const remaining = await client.query(
      `SELECT u.name, u.email, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY r.name`
    );
    console.log(`  Remaining users: ${remaining.rows.length}`);
    for (const u of remaining.rows) {
      console.log(`    ✓ ${u.name} (${u.email}) [${u.role}]`);
    }

    // Quick count of kept tables
    const keptChecks = [
      'roles', 'schema_migrations', 'currency_settings', 'settings',
      'form_templates', 'form_fields', 'form_steps',
      'form_submissions', 'form_analytics_events',
      'quick_links', 'voucher_codes', 'marketing_campaigns',
      'legal_documents', 'waiver_versions',
    ];
    console.log('\n  Kept tables:');
    for (const t of keptChecks) {
      const { rows } = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`    ${t}: ${rows[0].c} rows`);
    }

    // ── Commit or Rollback ─────────────────────────────────────
    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║   DRY RUN COMPLETE — No changes were applied     ║');
      console.log('║   Run: node _db_reset.js --execute               ║');
      console.log('╚══════════════════════════════════════════════════╝');
    } else {
      await client.query('COMMIT');
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║       ✓ DATABASE RESET COMPLETE                  ║');
      console.log('╚══════════════════════════════════════════════════╝');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nERROR — Transaction rolled back:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
