#!/usr/bin/env node
/**
 * Season reset — wipe **operational** data and **non-staff** users; keep catalog + **admin / manager / instructor** accounts.
 *
 * **Kept users:** `roles.name` in PRESERVED_STAFF_ROLE_NAMES (super_admin, admin, manager, instructor, freelancer),
 * plus optional env `CLEANUP_PRESERVE_USER_IDS` (comma-separated UUIDs).
 *
 * **Truncated:** bookings, rentals, shop, wallets, packages, member purchases, etc. (not in CATALOG_TABLES).
 * **Kept tables:** catalog including forms, events, voucher codes, instructor link tables, …
 *
 * Usage:
 *   node tests/scripts/cleanup.mjs
 *   CLEANUP_PRESERVE_USER_IDS=uuid node tests/scripts/cleanup.mjs --execute
 *   node tests/scripts/cleanup.mjs --execute --force-unknown-truncate
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

/** Lowercase `roles.name` — these accounts survive the reset. */
const PRESERVED_STAFF_ROLE_NAMES = ['super_admin', 'admin', 'manager', 'instructor', 'freelancer'];

function parseExtraPreserveUserIds() {
  const raw = process.env.CLEANUP_PRESERVE_USER_IDS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DRY_RUN = !process.argv.includes('--execute');
const FORCE_UNKNOWN = process.argv.includes('--force-unknown-truncate');

const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);
const title = (t) => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);

/**
 * Not truncated — catalog, form/event/voucher data you need for the product, and staff **configuration**
 * (instructor & manager commission links). Non-staff users are removed via selective `DELETE FROM users`.
 */
const CATALOG_TABLES = new Set([
  'schema_migrations',
  'roles',
  'settings',

  'skills',
  'skill_levels',
  'services',
  'service_categories',
  'service_packages',
  'service_prices',
  'package_prices',

  'products',
  'product_subcategories',
  'equipment',

  'accommodation_units',

  'member_offerings',

  'currency_settings',

  'financial_settings',
  'financial_settings_overrides',

  'wallet_settings',
  'wallet_bank_accounts',
  'wallet_promotions',

  'legal_documents',
  'waiver_versions',

  'form_templates',
  'form_template_versions',
  'form_fields',
  'form_steps',
  'form_email_notifications',
  'form_submissions',
  'form_analytics_events',
  'form_email_logs',
  'form_quick_action_tokens',

  'quick_links',
  'quick_link_registrations',

  'popup_templates',
  'popup_configurations',
  'popup_content_blocks',
  'popup_media_assets',
  'popup_targeting_rules',

  'events',

  'voucher_campaigns',
  'voucher_codes',

  'instructor_default_commissions',
  'instructor_category_rates',
  'instructor_skills',
  'instructor_services',
  'instructor_service_commissions',

  'manager_commission_settings',

  'marketing_campaigns',
  'api_keys',
]);

/**
 * Tables we expect to wipe (transactional / user data). Used only for validation warnings.
 * If the live DB has a table not in CATALOG_TABLES and not listed here, dry-run shows ⚠️ UNKNOWN.
 * Update this set when you add new operational tables.
 */
const DOCUMENTED_TRANSACTIONAL_TABLES = new Set([
  'accommodation_bookings',
  'audit_logs',
  'bank_transfer_receipts',
  'booking_custom_commissions',
  'booking_equipment',
  'booking_participants',
  'booking_reschedule_notifications',
  'booking_series',
  'booking_series_customers',
  'bookings',
  'business_expenses',
  'conversations',
  'conversation_participants',
  'currency_update_logs',
  'customer_packages',
  'deleted_bookings_backup',
  'deleted_booking_relations_backup',
  'deleted_entities_backup',
  'family_members',
  'feedback',
  'group_bookings',
  'group_booking_participants',
  'group_lesson_requests',
  'instructor_earnings',
  'instructor_payroll',
  'instructor_ratings',
  'instructor_student_notes',
  'liability_waivers',
  'manager_commissions',
  'manager_payouts',
  'manager_payout_items',
  'manager_salary_records',
  'member_purchases',
  'messages',
  'message_reactions',
  'notifications',
  'notification_settings',
  'payment_gateway_webhook_events',
  'payment_intents',
  'push_subscriptions',
  'query_performance_log',
  'recommended_products',
  'refunds',
  'repair_request_comments',
  'repair_requests',
  'rental_equipment',
  'rentals',
  'security_audit',
  'service_revenue_ledger',
  'shop_order_items',
  'shop_order_messages',
  'shop_order_status_history',
  'shop_orders',
  'spare_parts_orders',
  'student_accounts',
  'student_achievements',
  'student_progress',
  'student_support_requests',
  'transactions',
  'user_sessions',
  'user_tags',
  'user_vouchers',
  'voucher_redemptions',
  'wallet_audit_logs',
  'wallet_balances',
  'wallet_deposit_requests',
  'wallet_kyc_documents',
  'wallet_payment_methods',
  'wallet_transactions',
  'wallet_withdrawal_requests',
  'event_registrations',

  // backend/migrations (root) — user / session / popup usage
  'user_relationships',
  'user_preferences',
  'password_reset_tokens',
  'revenue_items',
  'popup_user_interactions',
  'popup_analytics',
  'user_popup_preferences',
  'user_consents',

  // Seen in production / extra migrations (archives, wallet notifications, etc.)
  'archive_legacy_transactions',
  'archive_student_accounts',
  'earnings_audit_log',
  'financial_events',
  'instructor_commission_history',
  'instructor_rate_history',
  'package_hour_fixes',
  'wallet_export_jobs',
  'wallet_notification_delivery_logs',
  'wallet_notification_preferences',
]);

/** Human-readable groups for dry-run output */
const TABLE_GROUPS = [
  {
    label: 'Bookings & lessons',
    prefixes: ['booking', 'group_', 'group_booking'],
    exact: new Set(['bookings', 'group_bookings', 'group_booking_participants', 'group_lesson_requests', 'booking_reschedule_notifications']),
  },
  {
    label: 'Wallet & payments',
    prefixes: ['wallet_', 'payment_', 'refunds', 'bank_transfer'],
    exact: new Set([
      'wallet_balances',
      'wallet_transactions',
      'wallet_withdrawal_requests',
      'wallet_deposit_requests',
      'wallet_audit_logs',
      'wallet_payment_methods',
      'wallet_kyc_documents',
      'payment_intents',
      'payment_gateway_webhook_events',
      'transactions',
      'refunds',
      'bank_transfer_receipts',
      'service_revenue_ledger',
    ]),
  },
  {
    label: 'Shop & inventory orders',
    prefixes: ['shop_order', 'spare_parts'],
    exact: new Set(['shop_orders', 'shop_order_items', 'shop_order_status_history', 'shop_order_messages', 'spare_parts_orders']),
  },
  {
    label: 'Rentals & accommodation',
    prefixes: ['rental', 'accommodation_booking'],
    exact: new Set(['rentals', 'rental_equipment', 'accommodation_bookings']),
  },
  {
    label: 'Packages & memberships',
    prefixes: ['customer_package', 'member_purchase'],
    exact: new Set(['customer_packages', 'member_purchases']),
  },
  {
    label: 'Messaging & notifications',
    prefixes: ['conversation', 'message', 'notification'],
    exact: new Set(['conversations', 'conversation_participants', 'messages', 'message_reactions', 'notifications', 'notification_settings']),
  },
  {
    label: 'Users & accounts',
    prefixes: ['family_', 'user_session', 'user_tag', 'student_', 'push_'],
    exact: new Set([
      'family_members',
      'user_sessions',
      'user_tags',
      'student_accounts',
      'student_progress',
      'student_achievements',
      'push_subscriptions',
    ]),
  },
  {
    label: 'Forms & links (responses / registrations)',
    prefixes: ['form_submission', 'form_analytic', 'form_email_log', 'form_quick', 'quick_link_reg'],
    exact: new Set([
      'form_submissions',
      'form_analytics_events',
      'form_email_logs',
      'form_quick_action_tokens',
      'quick_link_registrations',
    ]),
  },
  {
    label: 'Events & vouchers (instances)',
    prefixes: ['event_registr', 'voucher_code'],
    exact: new Set(['events', 'event_registrations', 'voucher_codes']),
  },
  {
    label: 'Instructor links (re-created when staff onboard)',
    prefixes: ['instructor_default', 'instructor_category', 'instructor_skill', 'instructor_service'],
    exact: new Set([
      'instructor_default_commissions',
      'instructor_category_rates',
      'instructor_skills',
      'instructor_services',
      'instructor_service_commissions',
    ]),
  },
  {
    label: 'Staff payouts & commissions (transactional)',
    prefixes: ['instructor_earn', 'instructor_payroll', 'manager_comm', 'manager_payout', 'manager_salary'],
    exact: new Set([
      'instructor_earnings',
      'instructor_payroll',
      'manager_commissions',
      'manager_payouts',
      'manager_payout_items',
      'manager_salary_records',
      'manager_commission_settings',
    ]),
  },
  {
    label: 'Vouchers (usage)',
    prefixes: ['voucher_redemption', 'user_voucher'],
    exact: new Set(['voucher_redemptions', 'user_vouchers']),
  },
  {
    label: 'Support, ratings, misc',
    prefixes: ['repair_', 'audit', 'security', 'feedback', 'liability', 'deleted_', 'query_performance', 'recommended_', 'event_registr', 'booking_custom', 'student_support', 'instructor_rating', 'instructor_student', 'business_expenses', 'currency_update'],
    exact: new Set([
      'repair_requests',
      'repair_request_comments',
      'audit_logs',
      'security_audit',
      'feedback',
      'liability_waivers',
      'deleted_bookings_backup',
      'deleted_booking_relations_backup',
      'deleted_entities_backup',
      'query_performance_log',
      'recommended_products',
      'event_registrations',
      'booking_custom_commissions',
      'student_support_requests',
      'instructor_ratings',
      'instructor_student_notes',
      'business_expenses',
      'currency_update_logs',
      'archive_legacy_transactions',
      'archive_student_accounts',
      'earnings_audit_log',
      'financial_events',
      'instructor_commission_history',
      'instructor_rate_history',
      'package_hour_fixes',
      'wallet_export_jobs',
      'wallet_notification_delivery_logs',
      'wallet_notification_preferences',
    ]),
  },
  {
    label: 'Accounts, tokens, popups (usage)',
    prefixes: ['user_pref', 'password_reset', 'user_relationship', 'popup_user', 'popup_analytic', 'user_popup', 'revenue_items'],
    exact: new Set([
      'user_preferences',
      'password_reset_tokens',
      'user_relationships',
      'popup_user_interactions',
      'popup_analytics',
      'user_popup_preferences',
      'revenue_items',
      'user_consents',
    ]),
  },
];

function groupForTable(tableName) {
  if (TABLE_GROUPS.some((g) => g.exact.has(tableName))) {
    return TABLE_GROUPS.find((g) => g.exact.has(tableName))?.label ?? 'Other transactional';
  }
  for (const g of TABLE_GROUPS) {
    if (g.prefixes.some((p) => tableName.startsWith(p))) {
      return g.label;
    }
  }
  return 'Other transactional';
}

async function countRows(client, table) {
  try {
    const { rows } = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM "${table}"`);
    return Number(rows[0].cnt);
  } catch {
    return null;
  }
}

async function main() {
  title(DRY_RUN ? 'DATABASE RESET — DRY RUN' : 'DATABASE RESET — EXECUTING');

  if (DRY_RUN) {
    log('\n  This is a DRY RUN. No data will be modified.');
    log('  Run with --execute to actually reset.');
    log('  Undocumented tables require --force-unknown-truncate with --execute.\n');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set in backend/.env');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    title('1 · Discover tables (information_schema)');

    const { rows: allTableRows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const allTables = allTableRows.map((r) => r.table_name);
    const tablesToTruncate = allTables.filter((t) => !CATALOG_TABLES.has(t) && t !== 'users');

    const unknownTruncate = tablesToTruncate.filter((t) => !DOCUMENTED_TRANSACTIONAL_TABLES.has(t));

    log(`\n  Public base tables:     ${allTables.length}`);
    log(`  Catalog (not truncated): ${CATALOG_TABLES.size} tables (+ forms/events/vouchers/instructor config)`);
    log(`  To truncate:            ${tablesToTruncate.length} operational tables (non-staff users deleted after)`);
    log(`  Undocumented (review): ${unknownTruncate.length}\n`);

    log('  ── CATALOG (never truncated) ──');
    for (const t of [...CATALOG_TABLES].sort()) {
      if (allTables.includes(t)) log(`    ✓ ${t}`);
    }
    const catalogMissing = [...CATALOG_TABLES].filter((t) => !allTables.includes(t));
    if (catalogMissing.length) {
      warn(`Catalog entries not in DB (ok if not migrated yet): ${catalogMissing.join(', ')}`);
    }

    log('\n  ── TRUNCATE (transactional / user data) ──');
    for (const t of tablesToTruncate) {
      const mark = unknownTruncate.includes(t) ? ' ⚠️ NOT IN DOCUMENTED_REGISTRY' : '';
      log(`    ✗ ${t}${mark}`);
    }

    if (unknownTruncate.length) {
      title('⚠️  Undocumented tables');
      log('  These exist in the DB and will be TRUNCATED but are not listed in DOCUMENTED_TRANSACTIONAL_TABLES.');
      log('  Add them to that set (if expected) or move to CATALOG_TABLES (if reference data).\n');
      for (const t of unknownTruncate) {
        log(`    • ${t}`);
      }
    }

    title('2 · Row counts (would be deleted)');

    const counts = [];
    for (const t of tablesToTruncate) {
      const cnt = await countRows(client, t);
      if (cnt !== null && cnt > 0) {
        counts.push({ table: t, count: cnt, group: groupForTable(t), unknown: unknownTruncate.includes(t) });
      }
    }
    counts.sort((a, b) => b.count - a.count);

    const byGroup = new Map();
    for (const row of counts) {
      if (!byGroup.has(row.group)) byGroup.set(row.group, []);
      byGroup.get(row.group).push(row);
    }

    let totalRows = 0;
    for (const [, rows] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      log(`\n  ${rows[0].group}`);
      for (const r of rows) {
        const u = r.unknown ? ' [unknown table]' : '';
        log(`    ${r.table}: ${r.count.toLocaleString()} row(s)${u}`);
        totalRows += r.count;
      }
    }

    const emptyOrMissing = tablesToTruncate.filter((t) => {
      const c = counts.find((x) => x.table === t);
      return !c;
    });
    if (emptyOrMissing.length) {
      log(`\n  (Empty or skipped: ${emptyOrMissing.length} table(s) — listed in truncate list, 0 rows or count failed)`);
    }

    log(`\n  ── Summary ──`);
    log(`  Tables truncated:     ${tablesToTruncate.length}`);
    log(`  Total rows (non-zero): ${totalRows.toLocaleString()}`);

    const roleNamesLower = PRESERVED_STAFF_ROLE_NAMES;
    const extraIds = parseExtraPreserveUserIds();

    const { rows: keepRows } = await client.query(
      `
      SELECT u.id, u.email, u.first_name, u.last_name, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE (r.name IS NOT NULL AND LOWER(r.name) = ANY($1::text[]))
         OR u.id = ANY($2::uuid[])
      ORDER BY r.name NULLS LAST, u.email
    `,
      [roleNamesLower, extraIds.length ? extraIds : []],
    );

    const { rows: [{ cnt: removeCount }] } = await client.query(
      `
      SELECT COUNT(*)::bigint AS cnt FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM roles r
        WHERE r.id = u.role_id AND LOWER(r.name) = ANY($1::text[])
      )
      AND NOT (CARDINALITY($2::uuid[]) > 0 AND u.id = ANY($2::uuid[]))
    `,
      [roleNamesLower, extraIds.length ? extraIds : []],
    );

    log(`\n  Staff / preserved user accounts (kept): ${keepRows.length}`);
    for (const u of keepRows.slice(0, 25)) {
      log(`    ✓ ${u.email ?? u.id} — ${u.role_name ?? 'extra ID'}`);
    }
    if (keepRows.length > 25) log(`    … and ${keepRows.length - 25} more`);

    log(`\n  User accounts to remove: ${Number(removeCount).toLocaleString()}`);
    log('  Preserved data tables: forms, events, voucher codes, quick link registrations, instructor config, etc.');
    if (extraIds.length) {
      log(`  Extra preserved IDs (env): ${extraIds.length}`);
    }

    if (DRY_RUN) {
      title('DRY RUN COMPLETE');
      log('\n  No changes made.');
      if (unknownTruncate.length) {
        log(`  ${unknownTruncate.length} table(s) need registry update or use --force-unknown-truncate with --execute.`);
      }
      log('  Run: node tests/scripts/cleanup.mjs --execute\n');
      return;
    }

    if (unknownTruncate.length && !FORCE_UNKNOWN) {
      console.error('\n❌ Refusing to execute: undocumented tables would be truncated.');
      console.error('   Fix DOCUMENTED_TRANSACTIONAL_TABLES / CATALOG_TABLES, or pass --force-unknown-truncate\n');
      process.exit(1);
    }

    title('3 · Nullify catalog FKs only for users who will be deleted');

    const { rows: doomedRows } = await client.query(
      `
      SELECT u.id FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM roles r
        WHERE r.id = u.role_id AND LOWER(r.name) = ANY($1::text[])
      )
      AND NOT (CARDINALITY($2::uuid[]) > 0 AND u.id = ANY($2::uuid[]))
    `,
      [PRESERVED_STAFF_ROLE_NAMES, extraIds.length ? extraIds : []],
    );
    const doomedIds = doomedRows.map((r) => r.id);

    await nullifyNullableUserFKsInCatalog(client, doomedIds);
    ok(
      doomedIds.length
        ? `Nullable catalog FKs cleared for ${doomedIds.length} user id(s) slated for removal`
        : 'No users to remove — skipped catalog FK nullify',
    );

    title('4 · Truncate operational tables (batch, excludes users + catalog)');

    if (tablesToTruncate.length === 0) {
      ok('Nothing to truncate');
    } else {
      const quoted = tablesToTruncate.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
      try {
        await client.query(`TRUNCATE TABLE ${quoted} CASCADE`);
        ok(`Truncated ${tablesToTruncate.length} table(s) in one batch`);
      } catch (e) {
        warn(`Batch TRUNCATE failed (${e.message.slice(0, 200)}), falling back per-table…`);
        let truncated = 0;
        for (const t of tablesToTruncate) {
          try {
            await client.query(`TRUNCATE TABLE "${t.replace(/"/g, '""')}" CASCADE`);
            truncated += 1;
          } catch (e2) {
            try {
              await client.query(`DELETE FROM "${t.replace(/"/g, '""')}"`);
              truncated += 1;
            } catch (e3) {
              warn(`Could not clean ${t}: ${e3.message.slice(0, 120)}`);
            }
          }
        }
        ok(`Truncated or cleared ${truncated} table(s)`);
      }
    }

    title('5 · Remove customer / non-staff user accounts');

    let deletedUsers = 0;
    if (doomedIds.length === 0) {
      ok('No users matched removal rules — skipped DELETE');
    } else {
      const delRes = await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [doomedIds]);
      deletedUsers = delRes.rowCount ?? 0;
      ok(`Deleted ${deletedUsers} user row(s) (staff roles preserved; CASCADE drops dependent rows for removed users)`);
    }

    title('6 · Wallet shells for remaining users (EUR @ 0)');

    try {
      await client.query(`
        INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount, updated_at)
        SELECT u.id, 'EUR', 0, 0, 0, NOW()
        FROM users u
        ON CONFLICT (user_id, currency) DO UPDATE SET
          available_amount = 0,
          pending_amount = 0,
          non_withdrawable_amount = 0,
          updated_at = NOW()
      `);
      ok('EUR wallet_balances ensured for all remaining users');
    } catch (e) {
      warn(`Wallet shell step skipped: ${e.message.slice(0, 160)}`);
    }

    title('RESET COMPLETE');

    const { rows: [{ cnt: remainingUsers }] } = await client.query('SELECT COUNT(*)::bigint AS cnt FROM users');
    log(`\n  Remaining users: ${Number(remainingUsers)} (staff + preserved IDs)`);
    log(`  Removed users:     ${deletedUsers}`);
    log(`  Truncated operational tables: ${tablesToTruncate.length}`);
    log('  Catalog + forms/events/vouchers/instructor config tables: not truncated');
    log('\n  ✅ Database reset finished.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Clear nullable catalog FKs only when they point at users who will be deleted (keeps staff audit links intact).
 */
async function nullifyNullableUserFKsInCatalog(client, userIdsToRemove) {
  if (!userIdsToRemove.length) return;

  const { rows: allFKs } = await client.query(`
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
      AND ccu.column_name = 'id'
      AND kcu.table_name <> 'users'
    ORDER BY kcu.table_name, kcu.column_name
  `);

  const catalogFKs = allFKs.filter((fk) => CATALOG_TABLES.has(fk.table_name));

  for (const { table_name, column_name } of catalogFKs.filter((fk) => fk.is_nullable === 'YES')) {
    try {
      const r = await client.query(
        `UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" = ANY($1::uuid[])`,
        [userIdsToRemove],
      );
      if (r.rowCount > 0) log(`    Nullified ${r.rowCount} row(s) in ${table_name}.${column_name}`);
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
