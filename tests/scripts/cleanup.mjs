#!/usr/bin/env node
/**
 * Database Reset — Wipe all transactional data while preserving configuration.
 *
 * KEEPS:
 *   - Staff users (Elif, Siyabend, Oguzhan) + admin + non-test/non-deleted users
 *   - Services, service_packages, service_prices, service_categories, package_prices
 *   - Roles, skills, skill_levels
 *   - Equipment, products, product_subcategories
 *   - Settings, financial_settings, financial_settings_overrides
 *   - Currency_settings
 *   - Accommodation_units
 *   - Member_offerings
 *   - Legal_documents, waiver_versions
 *   - Form templates, fields, steps, email notifications, template versions
 *   - Form submissions, analytics, email logs, quick action tokens (user data!)
 *   - Quick_links, quick_link_registrations
 *   - Popup templates, configurations, content blocks, media assets, targeting rules
 *   - Events
 *   - Voucher_campaigns (+ voucher_codes if hand-created)
 *   - Instructor config: default_commissions, category_rates, skills, services, service_commissions
 *   - Manager_commission_settings
 *   - Wallet_settings, wallet_bank_accounts
 *   - Schema_migrations
 *
 * DELETES (transactional data):
 *   - All bookings + sub-tables
 *   - All group bookings, group booking participants, group lesson requests
 *   - All financial transactions, earnings, commissions, payroll
 *   - All wallet transactions (balances reset to 0)
 *   - All rentals, accommodation bookings
 *   - All shop orders + sub-tables
 *   - All customer packages, member purchases
 *   - All messages, conversations, notifications
 *   - All audit/security logs
 *   - Test + soft-deleted users
 *   - etc.
 *
 * Usage:
 *   node tests/scripts/db-reset.mjs              # dry-run (shows what would be deleted)
 *   node tests/scripts/db-reset.mjs --execute     # actually delete
 *
 * Safe to run multiple times.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const DRY_RUN = !process.argv.includes('--execute');

// ── Helpers ────────────────────────────────────────────────────────
const log   = (msg) => console.log(msg);
const ok    = (msg) => console.log(`  ✅ ${msg}`);
const warn  = (msg) => console.log(`  ⚠️  ${msg}`);
const title = (t)   => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);

// ── Tables to KEEP (never truncate) ───────────────────────────────
const KEEP_TABLES = new Set([
  // System
  'schema_migrations',
  'roles',
  'settings',

  // Users (handled specially — test/soft-deleted users removed, rest kept)
  'users',

  // Skills & services
  'skills',
  'skill_levels',
  'services',
  'service_categories',
  'service_packages',
  'service_prices',
  'package_prices',

  // Shop / inventory
  'products',
  'product_subcategories',
  'equipment',

  // Accommodation config
  'accommodation_units',

  // Membership plans
  'member_offerings',

  // Currency
  'currency_settings',

  // Financial config
  'financial_settings',
  'financial_settings_overrides',

  // Wallet config
  'wallet_settings',
  'wallet_bank_accounts',

  // Legal
  'legal_documents',
  'waiver_versions',

  // Form structure (templates + submissions — user wants to keep form answers)
  'form_templates',
  'form_template_versions',
  'form_fields',
  'form_steps',
  'form_email_notifications',
  'form_submissions',
  'form_analytics_events',
  'form_email_logs',
  'form_quick_action_tokens',

  // Quick links + registrations
  'quick_links',
  'quick_link_registrations',

  // Popup config
  'popup_templates',
  'popup_configurations',
  'popup_content_blocks',
  'popup_media_assets',
  'popup_targeting_rules',

  // Events (the events themselves, not registrations)
  'events',

  // Voucher campaigns
  'voucher_campaigns',
  'voucher_codes',

  // Instructor config (NOT transactional earnings/payroll)
  'instructor_default_commissions',
  'instructor_category_rates',
  'instructor_skills',
  'instructor_services',
  'instructor_service_commissions',

  // Manager config
  'manager_commission_settings',
]);

// Staff user IDs to always keep
const STAFF_IDS = [
  'ba39789a-f957-4125-ac2a-f61fad37b5c4', // Elif
  'b18bdec1-b991-48a9-9dc7-0ff81db6ba2e', // Siyabend
  '59ab99e9-7165-4bcb-94c3-4bbb1badad11', // Oguzhan
];

// Known test emails (will be deleted even if not soft-deleted)
const TEST_EMAILS = [
  'lukas.hoffmann87@gmail.com', 'sophie.mueller92@gmail.com',
  'tobias.schneider85@gmail.com', 'laura.fischer95@gmail.com',
  'max.weber1990@gmail.com', 'emre.yilmaz91@gmail.com',
  'selin.kaya88@gmail.com', 'burak.demir93@gmail.com',
  'merve.celik90@gmail.com', 'kaan.ozdemir86@gmail.com',
];


async function main() {
  title(DRY_RUN ? 'DATABASE RESET — DRY RUN' : 'DATABASE RESET — EXECUTING');

  if (DRY_RUN) {
    log('\n  This is a DRY RUN. No data will be modified.');
    log('  Run with --execute to actually reset.\n');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set in backend/.env');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    // ── Step 1: Discover all tables ──
    title('1 · Discovering tables');

    const { rows: allTables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tablesToTruncate = allTables
      .map(r => r.table_name)
      .filter(t => !KEEP_TABLES.has(t));

    log(`\n  Total tables: ${allTables.length}`);
    log(`  Tables to KEEP: ${KEEP_TABLES.size}`);
    log(`  Tables to TRUNCATE: ${tablesToTruncate.length}\n`);

    // Show what will be kept
    log('  ── KEEPING ──');
    for (const t of [...KEEP_TABLES].sort()) {
      log(`    ✓ ${t}`);
    }

    log('\n  ── TRUNCATING ──');
    for (const t of tablesToTruncate) {
      log(`    ✗ ${t}`);
    }

    // ── Step 2: Count rows before truncation ──
    title('2 · Row counts (before reset)');

    let totalRowsToDelete = 0;
    for (const t of tablesToTruncate) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) as cnt FROM "${t}"`);
        const cnt = parseInt(rows[0].cnt);
        if (cnt > 0) {
          log(`    ${t}: ${cnt} row(s)`);
          totalRowsToDelete += cnt;
        }
      } catch { /* table might not exist */ }
    }
    log(`\n  Total rows to delete: ${totalRowsToDelete}`);

    // ── Group booking summary ──
    try {
      const gbCount = await client.query(`SELECT COUNT(*) as cnt FROM group_bookings`);
      const gbpCount = await client.query(`SELECT COUNT(*) as cnt FROM group_booking_participants`);
      const glrCount = await client.query(`SELECT COUNT(*) as cnt FROM group_lesson_requests`);
      const gb  = parseInt(gbCount.rows[0].cnt);
      const gbp = parseInt(gbpCount.rows[0].cnt);
      const glr = parseInt(glrCount.rows[0].cnt);
      if (gb + gbp + glr > 0) {
        log(`\n  ── Group Bookings ──`);
        log(`    group_bookings:              ${gb}`);
        log(`    group_booking_participants:   ${gbp}`);
        log(`    group_lesson_requests:        ${glr}`);
      }
    } catch { /* tables might not exist */ }

    // Also count test/soft-deleted users
    const { rows: testUsers } = await client.query(`
      SELECT id, first_name, last_name, email, deleted_at
      FROM users
      WHERE deleted_at IS NOT NULL
         OR LOWER(email) = ANY($1::text[])
    `, [TEST_EMAILS]);

    if (testUsers.length > 0) {
      log(`\n  Users to delete (${testUsers.length}):`);
      for (const u of testUsers) {
        const status = u.deleted_at ? '(soft-deleted)' : '(test account)';
        log(`    ✗ ${u.first_name ?? '?'} ${u.last_name ?? '?'} — ${u.email} ${status}`);
      }
    }

    // Count kept users
    const { rows: [{ cnt: keptCount }] } = await client.query(`
      SELECT COUNT(*) as cnt FROM users
      WHERE deleted_at IS NULL
        AND LOWER(email) NOT IN (${TEST_EMAILS.map((_, i) => `$${i + 1}`).join(',')})
    `, TEST_EMAILS);
    log(`\n  Users to KEEP: ${keptCount}`);

    if (DRY_RUN) {
      title('DRY RUN COMPLETE');
      log('\n  No changes made. Run with --execute to reset.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    // ══════════════════════════════════════════════════════════════
    // EXECUTION MODE — actually delete data
    // ══════════════════════════════════════════════════════════════

    // ── Step 3: Clean user FK references first ──
    title('3 · Cleaning FK references for test/soft-deleted users');

    const userIdsToDelete = testUsers.map(u => u.id);
    if (userIdsToDelete.length > 0) {
      await purgeUserFKs(client, userIdsToDelete);
      ok(`Cleaned FK references for ${userIdsToDelete.length} user(s)`);
    }

    // ── Step 4: Truncate transactional tables ──
    title('4 · Truncating transactional tables');

    // Use TRUNCATE CASCADE to handle inter-table FKs in one shot
    // Process in batches to avoid issues
    let truncated = 0;
    let truncateErrors = 0;

    for (const t of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE "${t}" CASCADE`);
        truncated++;
      } catch (e) {
        // Some tables might have FK references to kept tables — delete row by row
        try {
          await client.query(`DELETE FROM "${t}"`);
          truncated++;
        } catch (e2) {
          warn(`Could not clean ${t}: ${e2.message.slice(0, 100)}`);
          truncateErrors++;
        }
      }
    }
    ok(`Truncated ${truncated} table(s)${truncateErrors > 0 ? `, ${truncateErrors} error(s)` : ''}`);

    // ── Step 5: Delete test/soft-deleted users ──
    title('5 · Deleting test & soft-deleted users');

    if (userIdsToDelete.length > 0) {
      const { rowCount } = await client.query(
        'DELETE FROM users WHERE id = ANY($1::uuid[])',
        [userIdsToDelete]
      );
      ok(`Deleted ${rowCount} user(s)`);
    } else {
      ok('No users to delete');
    }

    // ── Step 6: Reset wallet balances for staff ──
    title('6 · Resetting staff wallet balances');

    await client.query(`
      UPDATE wallet_balances
      SET available_amount = 0, pending_amount = 0, non_withdrawable_amount = 0, updated_at = NOW()
      WHERE user_id = ANY($1::uuid[])
    `, [STAFF_IDS]);
    ok('Staff wallet balances reset to 0');

    // ── Step 7: Reset sequences if needed ──
    // (UUIDs don't use sequences, but some tables might have serial columns)

    // ── Final summary ──
    title('RESET COMPLETE');

    const { rows: [{ cnt: remainingUsers }] } = await client.query('SELECT COUNT(*) as cnt FROM users');
    log(`\n  Remaining users: ${remainingUsers}`);
    log(`  Tables truncated: ${truncated}`);
    log(`  Tables kept: ${KEEP_TABLES.size}`);
    log('  Staff wallet balances: reset to 0');
    log('\n  ✅ Database reset successfully!\n');

  } finally {
    client.release();
    await pool.end();
  }
}


/**
 * Dynamically discover ALL foreign keys referencing users(id) and clean them.
 * - Nullable FK columns → SET NULL
 * - NOT NULL FK columns → DELETE the row
 * Handles dependency ordering by retrying failed deletes in a second pass.
 */
async function purgeUserFKs(client, userIds) {
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

  // Only clean FKs in KEEP tables — transactional tables will be truncated anyway
  const keepFKs = allFKs.filter(fk => KEEP_TABLES.has(fk.table_name));

  // Pass 1: Nullify nullable FK columns
  for (const { table_name, column_name } of keepFKs.filter(fk => fk.is_nullable === 'YES')) {
    try {
      const r = await client.query(
        `UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" = ANY($1::uuid[])`,
        [userIds]
      );
      if (r.rowCount > 0) log(`    Nullified ${r.rowCount} row(s) in ${table_name}.${column_name}`);
    } catch { /* ignore */ }
  }

  // Pass 2: Delete NOT NULL FK rows in kept tables
  const notNulls = keepFKs.filter(fk => fk.is_nullable === 'NO');
  const unique = [...new Map(notNulls.map(fk => [`${fk.table_name}.${fk.column_name}`, fk])).values()];

  const failed = [];
  for (const { table_name, column_name } of unique) {
    try {
      const r = await client.query(
        `DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1::uuid[])`,
        [userIds]
      );
      if (r.rowCount > 0) log(`    Deleted ${r.rowCount} row(s) from ${table_name}.${column_name}`);
    } catch {
      failed.push({ table_name, column_name });
    }
  }

  // Pass 3: Retry failures
  for (const { table_name, column_name } of failed) {
    try {
      const r = await client.query(
        `DELETE FROM "${table_name}" WHERE "${column_name}" = ANY($1::uuid[])`,
        [userIds]
      );
      if (r.rowCount > 0) log(`    Deleted ${r.rowCount} row(s) from ${table_name}.${column_name} (retry)`);
    } catch (e) {
      warn(`Could not clean ${table_name}.${column_name}: ${e.message.slice(0, 120)}`);
    }
  }
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
