#!/usr/bin/env node
/**
 * Cleanup – Delete all test customers created by the test flow scripts.
 *
 * 1. Hard-deletes each test profile (and all their linked data) via the API.
 * 2. Directly purges any remaining stale / soft-deleted bookings for Elif Sarı
 *    from the database so her lesson history stays clean.
 *
 * Usage:  node tests/scripts/cleanup.mjs
 * Safe to run multiple times — skips profiles that don't exist.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  API, PROFILES, TURKISH_PROFILES,
  ELIF_ID, SIYABEND_ID, OGUZHAN_ID,
  log, ok, fail, title,
  api, adminLogin,
} from './_shared.mjs';

// Load backend .env so DATABASE_URL is available
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

async function main() {
  title('CLEANUP – DELETE TEST CUSTOMERS');

  // 1. Admin login
  const token = await adminLogin();
  ok('Logged in as admin');

  // 2. Fetch all users so we can match by email
  log('\n  Fetching user list…');
  const res = await api('GET', '/users', null, token);
  if (!res.ok) throw new Error(`GET /users → ${res.status}`);

  const users = Array.isArray(res.data) ? res.data : res.data.users || res.data.data || [];
  const testEmails = new Set([...PROFILES, ...TURKISH_PROFILES].map(p => p.email.toLowerCase()));

  // Find matching users
  const matches = users.filter(u => testEmails.has((u.email || '').toLowerCase()));

  if (matches.length === 0) {
    log('\n  No test customers found — skipping user deletion.\n');
  }

  let deleted = 0;
  let errors  = 0;
  const failedUsers = [];

  if (matches.length > 0) {
    log(`\n  Found ${matches.length} test customer(s) to delete:\n`);
    for (const u of matches) {
      log(`    • ${u.first_name} ${u.last_name} (${u.email}) — ${u.id}`);
    }

    // 3. Hard-delete each one
    for (const u of matches) {
      const name = `${u.first_name} ${u.last_name}`;
      log(`\n  Deleting ${name} (${u.id})…`);

      const del = await api(
        'DELETE',
        `/users/${u.id}?hardDelete=true&deleteAllData=true`,
        null,
        token,
      );

      if (del.ok) {
        deleted++;
        ok(`${name} deleted (${del.data?.deletionType || 'hard'})`);
      } else {
        const msg = del.data?.message || del.data?.error || JSON.stringify(del.data).slice(0, 200);
        fail(`${name}: ${del.status} — ${msg}`);
        errors++;
        failedUsers.push(u);
      }
    }

    // 3b. Retry failed users via direct DB cleanup
    if (failedUsers.length > 0) {
      title('3b · Retrying failed deletions via DB cleanup');
      const dbUrlRetry = process.env.DATABASE_URL;
      if (dbUrlRetry) {
        const retryPool = new pg.Pool({ connectionString: dbUrlRetry });
        const retryClient = await retryPool.connect();
        try {
          const failedIds = failedUsers.map(u => u.id);

          // Clean blocking FK references for these users
          const blockingTables = [
            ['shop_order_status_history', 'changed_by'],
            ['shop_order_items', 'order_id', 'shop_orders', 'user_id'],
          ];
          // Direct column references
          for (const [table, col] of blockingTables.filter(t => t.length === 2)) {
            try {
              const r = await retryClient.query(
                `DELETE FROM ${table} WHERE ${col} = ANY($1::uuid[])`, [failedIds]
              );
              if (r.rowCount > 0) log(`    Cleared ${r.rowCount} row(s) from ${table}.${col}`);
            } catch { /* ignore */ }
          }

          // Also clear shop_order_status_history via shop_orders join
          try {
            const { rowCount } = await retryClient.query(`
              DELETE FROM shop_order_status_history
              WHERE order_id IN (SELECT id FROM shop_orders WHERE user_id = ANY($1::uuid[]))
            `, [failedIds]);
            if (rowCount > 0) log(`    Cleared ${rowCount} shop_order_status_history row(s) via shop_orders`);
          } catch { /* ignore */ }

          // Clear shop_order_items via shop_orders
          try {
            const { rowCount } = await retryClient.query(`
              DELETE FROM shop_order_items
              WHERE order_id IN (SELECT id FROM shop_orders WHERE user_id = ANY($1::uuid[]))
            `, [failedIds]);
            if (rowCount > 0) log(`    Cleared ${rowCount} shop_order_items row(s)`);
          } catch { /* ignore */ }

          // Clear shop_orders themselves
          try {
            const { rowCount } = await retryClient.query(
              `DELETE FROM shop_orders WHERE user_id = ANY($1::uuid[])`, [failedIds]
            );
            if (rowCount > 0) log(`    Cleared ${rowCount} shop_orders row(s)`);
          } catch { /* ignore */ }
        } finally {
          retryClient.release();
          await retryPool.end();
        }

        // Retry API deletion
        for (const u of failedUsers) {
          const name = `${u.first_name} ${u.last_name}`;
          log(`\n  Retrying ${name} (${u.id})…`);
          const del = await api('DELETE', `/users/${u.id}?hardDelete=true&deleteAllData=true`, null, token);
          if (del.ok) {
            deleted++;
            errors--;
            ok(`${name} deleted on retry (${del.data?.deletionType || 'hard'})`);
          } else {
            const msg = del.data?.message || del.data?.error || JSON.stringify(del.data).slice(0, 200);
            fail(`${name} retry failed: ${del.status} — ${msg}`);
          }
        }
      } else {
        log('  ⚠️  DATABASE_URL not set — cannot retry via DB cleanup');
      }
    }

    // 4. Summary
    title('CLEANUP RESULTS');
    log(`\n  Deleted: ${deleted}  |  Errors: ${errors}  |  Total: ${matches.length}\n`);

    if (errors === 0) {
      log('  🧹 All test customers cleaned up!\n');
    } else {
      log(`  ⚠️  ${errors} deletion(s) failed — check output above.\n`);
    }
  }

  // 5. DB-level purge: remove all stale bookings across all instructors
  //    (soft-deleted OR student no longer in users table OR NULL student)
  title('5 · Purging stale bookings from DB (all instructors)');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log('  ⚠️  DATABASE_URL not set — skipping DB purge step.\n');
    process.exit(errors > 0 ? 1 : 0);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    // Find all stale bookings across all instructors:
    //   • soft-deleted (deleted_at IS NOT NULL)
    //   • no student (student_user_id IS NULL)
    //   • student was hard/soft-deleted (not found in active users)
    const { rows: stale } = await client.query(`
      SELECT b.id
      FROM   bookings b
      WHERE  b.deleted_at IS NOT NULL
         OR  b.student_user_id IS NULL
         OR  NOT EXISTS (
               SELECT 1 FROM users u
               WHERE  u.id = b.student_user_id
                 AND  u.deleted_at IS NULL
             )
    `);

    if (stale.length === 0) {
      ok('No stale bookings found');
    } else {
      const ids = stale.map(r => r.id);
      log(`  Found ${ids.length} stale booking(s) — purging…`);

      // Remove dependent rows first, then the bookings themselves
      await client.query(
        'DELETE FROM instructor_earnings WHERE booking_id = ANY($1::uuid[])',
        [ids]
      );
      await client.query(
        'DELETE FROM manager_commissions WHERE source_id = ANY($1::text[])',
        [ids]
      );
      await client.query(
        "DELETE FROM financial_events WHERE entity_type = 'booking' AND entity_id = ANY($1::uuid[])",
        [ids]
      );
      await client.query(
        'DELETE FROM bookings WHERE id = ANY($1::uuid[])',
        [ids]
      );
      ok(`Purged ${ids.length} stale booking(s)`);
    }

    // ── Step 5b. Purge orphaned manager commissions ──
    title('5b · Purging orphaned manager commission records');

    // Delete manager_commissions whose source booking/rental no longer exists
    const { rowCount: orphanedBookingComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'booking'
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id::text = mc.source_id)
    `);
    const { rowCount: orphanedRentalComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'rental'
        AND NOT EXISTS (SELECT 1 FROM rentals r WHERE r.id::text = mc.source_id)
    `);
    const { rowCount: orphanedShopComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'shop'
        AND NOT EXISTS (SELECT 1 FROM shop_orders so WHERE so.id::text = mc.source_id)
    `);
    const { rowCount: orphanedAccomComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'accommodation'
        AND NOT EXISTS (SELECT 1 FROM accommodation_bookings ab WHERE ab.id::text = mc.source_id)
    `);
    const { rowCount: orphanedMemberComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'membership'
        AND NOT EXISTS (SELECT 1 FROM member_purchases mp WHERE mp.id::text = mc.source_id)
    `);
    const { rowCount: orphanedPkgComm } = await client.query(`
      DELETE FROM manager_commissions mc
      WHERE mc.source_type = 'package'
        AND NOT EXISTS (SELECT 1 FROM customer_packages cp WHERE cp.id::text = mc.source_id)
    `);
    const totalOrphaned = (orphanedBookingComm || 0) + (orphanedRentalComm || 0) + (orphanedShopComm || 0) + (orphanedAccomComm || 0) + (orphanedMemberComm || 0) + (orphanedPkgComm || 0);
    if (totalOrphaned > 0) {
      ok(`Purged ${totalOrphaned} orphaned manager commission(s)`);
    } else {
      ok('No orphaned manager commissions found');
    }

    // Also clean up orphaned manager_salary_records for months with no remaining commissions
    const { rowCount: orphanedSalary } = await client.query(`
      DELETE FROM manager_salary_records msr
      WHERE msr.salary_type = 'commission'
        AND NOT EXISTS (
          SELECT 1 FROM manager_commissions mc
          WHERE mc.manager_user_id = msr.manager_user_id
            AND mc.period_month = msr.period_month
            AND mc.status != 'cancelled'
        )
    `);
    if (orphanedSalary > 0) {
      ok(`Purged ${orphanedSalary} orphaned manager salary record(s)`);
    }

    // ── Step 5c. Purge orphaned instructor_earnings (booking no longer exists) ──
    title('5c · Purging orphaned instructor earnings');
    const { rowCount: orphanedEarnings } = await client.query(`
      DELETE FROM instructor_earnings ie
      WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = ie.booking_id)
    `);
    if (orphanedEarnings > 0) {
      ok(`Purged ${orphanedEarnings} orphaned instructor earning(s)`);
    } else {
      ok('No orphaned instructor earnings found');
    }

    // ── Step 5d. Purge orphaned instructor_payroll ──
    title('5d · Purging orphaned instructor payroll records');
    const { rowCount: orphanedPayroll } = await client.query(`
      DELETE FROM instructor_payroll ip
      WHERE NOT EXISTS (
        SELECT 1 FROM instructor_earnings ie
        WHERE ie.instructor_id = ip.instructor_id
      )
    `);
    if (orphanedPayroll > 0) {
      ok(`Purged ${orphanedPayroll} orphaned instructor payroll record(s)`);
    } else {
      ok('No orphaned instructor payroll records found');
    }

    // ── Step 5e. Purge test-generated wallet_transactions for instructors/manager ──
    title('5e · Purging test-generated wallet transactions');
    const staffIds = [ELIF_ID, SIYABEND_ID, OGUZHAN_ID];

    // Delete wallet_transactions with test descriptions
    const { rowCount: testWalletTx } = await client.query(`
      DELETE FROM wallet_transactions
      WHERE description LIKE 'Mega test%'
    `);
    if (testWalletTx > 0) {
      ok(`Purged ${testWalletTx} test-generated wallet transaction(s)`);
    } else {
      ok('No test-generated wallet transactions found');
    }

    // Also purge orphaned wallet_transactions for staff that reference deleted entities
    const { rowCount: orphanedStaffTx } = await client.query(`
      DELETE FROM wallet_transactions wt
      WHERE wt.user_id = ANY($1::uuid[])
        AND wt.entity_type = 'manager_payment'
        AND NOT EXISTS (
          SELECT 1 FROM manager_commissions mc
          WHERE mc.manager_user_id = wt.user_id
        )
    `, [staffIds]);
    if (orphanedStaffTx > 0) {
      ok(`Purged ${orphanedStaffTx} orphaned staff wallet transaction(s)`);
    }

    // Recalculate wallet_balances for staff from remaining transactions
    await client.query(`
      UPDATE wallet_balances wb
      SET available_amount = 0, pending_amount = 0, non_withdrawable_amount = 0, updated_at = NOW()
      WHERE user_id = ANY($1::uuid[])
    `, [staffIds]);
    await client.query(`
      UPDATE wallet_balances wb
      SET available_amount = COALESCE(sub.sum_avail, 0),
          pending_amount = COALESCE(sub.sum_pending, 0),
          non_withdrawable_amount = COALESCE(sub.sum_nw, 0),
          updated_at = NOW()
      FROM (
        SELECT user_id,
               SUM(available_delta) AS sum_avail,
               SUM(pending_delta) AS sum_pending,
               SUM(non_withdrawable_delta) AS sum_nw
        FROM wallet_transactions
        WHERE user_id = ANY($1::uuid[])
        GROUP BY user_id
      ) sub
      WHERE wb.user_id = sub.user_id
    `, [staffIds]);
    ok('Recalculated wallet balances for staff');

    // ── Step 6. Hard-purge all soft-deleted users + their orphaned records ──
    title('6 · Purging soft-deleted users and their orphaned records');

    const { rows: deletedUsers } = await client.query(`
      SELECT id, first_name, last_name, email
      FROM   users
      WHERE  deleted_at IS NOT NULL
    `);

    if (deletedUsers.length === 0) {
      ok('No soft-deleted users found');
    } else {
      const uids = deletedUsers.map(u => u.id);
      log(`  Found ${uids.length} soft-deleted user(s):`);
      for (const u of deletedUsers) {
        log(`    • ${u.id.slice(0,8)}  ${u.first_name ?? '?'} ${u.last_name ?? '?'}  (${u.email})`);
      }

      // Step 1: Discover ALL nullable FK columns referencing users(id) and nullify them
      const { rows: fkRefs } = await client.query(`
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name
          AND kcu.constraint_schema = rc.constraint_schema
        JOIN information_schema.key_column_usage rcu
          ON rcu.constraint_name = rc.unique_constraint_name
          AND rcu.constraint_schema = rc.constraint_schema
        JOIN information_schema.columns c
          ON c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
          AND c.table_schema = 'public'
        WHERE rcu.table_name = 'users'
          AND rcu.column_name = 'id'
          AND c.is_nullable = 'YES'
          AND kcu.table_name <> 'users'
      `);
      for (const ref of fkRefs) {
        try {
          const r = await client.query(
            `UPDATE ${ref.table_name} SET ${ref.column_name} = NULL WHERE ${ref.column_name} = ANY($1::uuid[])`,
            [uids]
          );
          if (r.rowCount > 0) log(`    Nullified ${r.rowCount} row(s) in ${ref.table_name}.${ref.column_name}`);
        } catch { /* ignore if column type mismatch */ }
      }

      // Step 2: Delete rows in all tables that reference these users
      const tableCols = [
        ['liability_waivers',              'user_id'],
        ['instructor_earnings',            'instructor_id'],
        ['booking_series_customers',       'customer_user_id'],
        ['booking_series',                 'instructor_user_id'],
        ['wallet_transactions',            'user_id'],
        ['wallet_balances',                'user_id'],
        ['transactions',                   'user_id'],
        ['notifications',                  'user_id'],
        ['user_consents',                  'user_id'],
        ['instructor_services',            'instructor_id'],
        ['financial_events',               'user_id'],
        ['student_accounts',               'user_id'],
        ['instructor_service_commissions', 'instructor_id'],
        ['event_registrations',            'user_id'],
        ['instructor_payroll',             'instructor_id'],
        ['student_progress',               'student_id'],
        ['student_progress',               'instructor_id'],
        ['accommodation_bookings',         'guest_id'],
        ['security_audit',                 'user_id'],
        ['api_keys',                       'user_id'],
        ['voucher_redemptions',            'user_id'],
        ['quick_link_registrations',       'user_id'],
        ['form_submissions',               'user_id'],
        ['manager_salary_records',         'manager_user_id'],
        ['service_revenue_ledger',         'customer_id'],
        ['rentals',                        'user_id'],
        ['customer_packages',              'customer_id'],
        ['family_members',                 'parent_user_id'],
        ['member_purchases',               'user_id'],
        ['manager_commissions',            'manager_user_id'],
        ['bookings',                       'student_user_id'],
        ['bookings',                       'instructor_user_id'],
        ['bookings',                       'customer_user_id'],
        ['audit_logs',                     'user_id'],
        ['audit_logs',                     'target_user_id'],
        ['audit_logs',                     'actor_user_id'],
        ['shop_order_status_history',      'changed_by'],
      ];
      for (const [table, col] of tableCols) {
        try {
          const r = await client.query(
            `DELETE FROM ${table} WHERE ${col} = ANY($1::uuid[])`,
            [uids]
          );
          if (r.rowCount > 0) log(`    Deleted ${r.rowCount} row(s) from ${table}.${col}`);
        } catch { /* ignore */ }
      }

      // Step 2b: Clean shop orders (need to delete items first due to FK)
      try {
        const { rowCount: soiCount } = await client.query(`
          DELETE FROM shop_order_items
          WHERE order_id IN (SELECT id FROM shop_orders WHERE user_id = ANY($1::uuid[]))
        `, [uids]);
        if (soiCount > 0) log(`    Deleted ${soiCount} row(s) from shop_order_items (via shop_orders)`);
      } catch { /* ignore */ }
      try {
        const { rowCount: soshCount } = await client.query(`
          DELETE FROM shop_order_status_history
          WHERE order_id IN (SELECT id FROM shop_orders WHERE user_id = ANY($1::uuid[]))
        `, [uids]);
        if (soshCount > 0) log(`    Deleted ${soshCount} row(s) from shop_order_status_history (via shop_orders)`);
      } catch { /* ignore */ }
      try {
        const { rowCount: soCount } = await client.query(
          `DELETE FROM shop_orders WHERE user_id = ANY($1::uuid[])`, [uids]
        );
        if (soCount > 0) log(`    Deleted ${soCount} row(s) from shop_orders`);
      } catch { /* ignore */ }

      // Step 3: Hard-delete the users
      const { rowCount } = await client.query(
        'DELETE FROM users WHERE id = ANY($1::uuid[])',
        [uids]
      );
      ok(`Hard-deleted ${rowCount} soft-deleted user(s) and their records`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  process.exit(1);
});
