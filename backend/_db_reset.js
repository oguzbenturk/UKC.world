import { pool } from './db.js';

// ============================================================
// DATABASE FULL RESET SCRIPT
// Keeps ONLY:
//   - users table: admin + manager accounts (login credentials)
//   - roles table: all role definitions & permissions
//   - schema_migrations: so migrations don't re-run
//
// Wipes EVERYTHING else — true clean slate.
// Configure your app from scratch after running this.
//
// ⚠ Run _db_backup.js FIRST!
// Usage:
//   node _db_reset.js            → dry run (preview only)
//   node _db_reset.js --execute  → apply for real
// ============================================================

const ADMIN_USER_ID = '9f64cebb-8dd0-4ff3-be66-77beb73b0750';   // System Administrator

// Tables to NEVER touch
const PROTECTED_TABLES = new Set([
  'users',              // handled separately (keep admin/manager, delete rest)
  'roles',              // role definitions & permissions
  'schema_migrations',  // migration tracking
]);

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

    // ── Step 1: Discover all tables ────────────────────────────
    console.log('── Step 1: Discovering all tables ──');

    const allTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const allTables = allTablesResult.rows.map(r => r.table_name);
    const tablesToTruncate = allTables.filter(t => !PROTECTED_TABLES.has(t));

    console.log(`  Total tables in DB: ${allTables.length}`);
    console.log(`  Protected (kept):   ${PROTECTED_TABLES.size} → ${[...PROTECTED_TABLES].join(', ')}`);
    console.log(`  Will truncate:      ${tablesToTruncate.length}\n`);

    // ── Step 2: Pre-count rows in all tables to truncate ───────
    console.log('── Step 2: Pre-counting rows ──');

    let totalRows = 0;
    for (const t of tablesToTruncate) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) as c FROM "${t}"`);
        const count = parseInt(rows[0].c);
        if (count > 0) {
          console.log(`  ${t}: ${count} rows`);
          totalRows += count;
        }
      } catch {
        console.log(`  ${t}: (could not count — skipping)`);
      }
    }
    console.log(`  Total rows to wipe: ${totalRows}\n`);

    // ── Step 3: Truncate everything except protected tables ────
    console.log('── Step 3: Truncating all data tables ──');

    const truncateSQL = `TRUNCATE TABLE ${tablesToTruncate.map(t => `"${t}"`).join(', ')} CASCADE`;
    await client.query(truncateSQL);
    console.log(`  → Truncated ${tablesToTruncate.length} tables\n`);

    // ── Step 4: Delete non-admin/manager users ─────────────────
    console.log('── Step 4: Deleting non-admin users ──');

    const toDelete = await client.query(
      `SELECT u.name, u.email, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id != $1
       ORDER BY r.name, u.name`,
      [ADMIN_USER_ID]
    );
    if (toDelete.rows.length > 10) {
      console.log(`  Will delete ${toDelete.rows.length} users (showing first 10):`);
      for (const u of toDelete.rows.slice(0, 10)) {
        console.log(`    [DELETE] ${u.name} (${u.email}) [${u.role}]`);
      }
      console.log(`    ... and ${toDelete.rows.length - 10} more`);
    } else {
      for (const u of toDelete.rows) {
        console.log(`  [DELETE] ${u.name} (${u.email}) [${u.role}]`);
      }
    }

    const deleteResult = await client.query(
      'DELETE FROM users WHERE id != $1',
      [ADMIN_USER_ID]
    );
    console.log(`  → Deleted ${deleteResult.rowCount} users\n`);

    // ── Step 5: Reset admin user fields to clean state ─────────
    console.log('── Step 5: Resetting admin user fields ──');

    await client.query(`
      UPDATE users SET
        balance = 0,
        total_spent = 0,
        remaining_hours = 0,
        package_hours = 0,
        failed_login_attempts = 0,
        account_locked = false,
        account_locked_at = NULL,
        deleted_at = NULL,
        deleted_by = NULL,
        last_failed_login_at = NULL
      WHERE id = $1
    `, [ADMIN_USER_ID]);
    console.log('  → Admin account reset to clean state\n');

    // ── Step 6: Seed essential data ────────────────────────────
    console.log('── Step 6: Seeding essential data ──');

    // Currency settings (required — without this all financial ops break)
    await client.query(`
      INSERT INTO currency_settings (
        currency_code, currency_name, symbol, decimal_places,
        exchange_rate, base_currency, is_active,
        auto_update_enabled, update_frequency_hours
      ) VALUES
        ('EUR', 'Euro', '€', 2, 1.00000, true, true, false, 24),
        ('USD', 'US Dollar', '$', 2, 1.08000, false, true, true, 12),
        ('TRY', 'Turkish Lira', '₺', 2, 38.50000, false, true, true, 4),
        ('GBP', 'British Pound', '£', 2, 0.86000, false, true, true, 12)
      ON CONFLICT (currency_code) DO NOTHING
    `);
    console.log('  ✓ currency_settings: 4 currencies (EUR base, USD, TRY, GBP)');

    // App settings (recommended — backend returns defaults if empty, but
    // having these makes the Settings admin page work correctly from day 1)
    await client.query(`
      INSERT INTO settings (key, value, description, updated_at) VALUES
        ('business_info', '{"name":"Plannivo Business Center","email":"info@plannivo.com","phone":"","address":""}', 'Business information', NOW()),
        ('booking_defaults', '{"defaultDuration":120,"allowedDurations":[60,90,120,150,180]}', 'Default booking durations', NOW()),
        ('defaultCurrency', '"EUR"', 'Default currency', NOW()),
        ('allowed_registration_currencies', '["EUR","USD","TRY"]', 'Currencies available during registration', NOW())
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('  ✓ settings: business_info, booking_defaults, defaultCurrency, registration currencies');

    console.log('  Done.\n');

    // ── Step 7: Verification ───────────────────────────────────
    console.log('── Step 7: Verification ──');

    const remaining = await client.query(
      `SELECT u.name, u.email, r.name as role
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY r.name`
    );
    console.log(`  Remaining users: ${remaining.rows.length}`);
    for (const u of remaining.rows) {
      console.log(`    ✓ ${u.name} (${u.email}) [${u.role}]`);
    }

    // Verify protected tables still have data
    console.log('\n  Protected tables:');
    for (const t of PROTECTED_TABLES) {
      const { rows } = await client.query(`SELECT COUNT(*) as c FROM "${t}"`);
      console.log(`    ${t}: ${rows[0].c} rows`);
    }

    // Spot-check wiped vs seeded tables
    console.log('\n  Seeded tables:');
    for (const t of ['currency_settings', 'settings']) {
      const { rows } = await client.query(`SELECT COUNT(*) as c FROM "${t}"`);
      console.log(`    ${t}: ${rows[0].c} rows`);
    }

    console.log('\n  Sample wiped tables (should all be 0):');
    const spotChecks = ['services', 'bookings', 'products',
      'form_templates', 'voucher_codes',
      'quick_links', 'notifications', 'wallet_balances'];
    for (const t of spotChecks) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) as c FROM "${t}"`);
        console.log(`    ${t}: ${rows[0].c} rows`);
      } catch {
        // table might not exist
      }
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
      console.log('║       ✓ FULL DATABASE RESET COMPLETE             ║');
      console.log('║   Only admin users + roles + migrations remain   ║');
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
