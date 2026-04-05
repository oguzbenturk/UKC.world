#!/usr/bin/env node
/**
 * Truncates all **data** in `public` while keeping table definitions. Preserves `schema_migrations`.
 * Re-seeds minimal rows: roles, currency_settings, security `settings`, one admin user (+ EUR wallet if applicable).
 *
 * Usage (from repo root):
 *   node backend/scripts/schema-only-reset.mjs
 *   node backend/scripts/schema-only-reset.mjs --execute
 *
 * Credentials (prefer env for anything beyond local dev):
 *   SCHEMA_RESET_ADMIN_EMAIL
 *   SCHEMA_RESET_ADMIN_PASSWORD
 */

import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = !process.argv.includes('--execute');

const EXCLUDED_FROM_TRUNCATE = new Set([
  'schema_migrations',
  'spatial_ref_sys',
  'geography_columns',
  'geometry_columns',
]);

const ADMIN_EMAIL = (process.env.SCHEMA_RESET_ADMIN_EMAIL || 'admin@plannivo.com').toLowerCase();
const ADMIN_PASSWORD = process.env.SCHEMA_RESET_ADMIN_PASSWORD || 'asdasd35';

/** Matches `backend/routes/auth.js` outsider bootstrap id. */
const OUTSIDER_ROLE_ID = 'e1a2b3c4-d5e6-47f8-9a0b-c1d2e3f4a5b6';
/** Matches `backend/migrations/018_add_trusted_customer_role.sql`. */
const TRUSTED_CUSTOMER_ROLE_ID = 'a7b8c9d0-e1f2-43a4-b5c6-d7e8f9a0b1c2';

const CUSTOMER_PERMS = {
  'bookings:read': true,
  'services:read': true,
  'profile:write': true,
};

const ROLE_SEEDS = [
  ['super_admin', 'Super Administrator with full system access', { '*': true }],
  [
    'admin',
    'Administrator with most system access',
    {
      'users:read': true,
      'users:write': true,
      'bookings:*': true,
      'services:*': true,
      'equipment:*': true,
      'finances:read': true,
      'reports:*': true,
      'settings:read': true,
    },
  ],
  [
    'manager',
    'Manager with operational access',
    {
      'users:read': true,
      'bookings:*': true,
      'services:read': true,
      'equipment:*': true,
      'finances:read': true,
      'reports:read': true,
    },
  ],
  [
    'instructor',
    'Instructor with booking and student access',
    {
      'bookings:read': true,
      'bookings:write': true,
      'students:read': true,
      'students:write': true,
      'services:read': true,
      'equipment:read': true,
    },
  ],
  ['customer', 'Customer with limited access', CUSTOMER_PERMS],
  ['student', 'Registered student / customer', CUSTOMER_PERMS],
  ['freelancer', 'Freelance instructor', null],
];

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (load backend/.env or export DATABASE_URL).');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    const { rows: tableRows } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename != ALL($1::text[])
      ORDER BY tablename
    `, [[...EXCLUDED_FROM_TRUNCATE]]);

    const tables = tableRows.map((r) => r.tablename);
    if (tables.length === 0) {
      console.log('No public tables to truncate (excluding exclusions).');
      process.exit(0);
    }

    const quoted = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
    const truncateSql = `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`;

    if (DRY_RUN) {
      console.log('Dry run — no changes. Pass --execute to truncate and seed admin.\n');
      console.log(`Would truncate ${tables.length} tables (schema_migrations excluded).`);
      console.log(tables.join(', '));
      console.log('\nThen seed roles, currencies, settings, admin:', ADMIN_EMAIL);
      process.exit(0);
    }

    await client.query('BEGIN');

    await client.query(truncateSql);

    for (const [name, description, permissions] of ROLE_SEEDS) {
      await client.query(
        `INSERT INTO roles (name, description, permissions, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW(), NOW())`,
        [name, description, permissions == null ? null : JSON.stringify(permissions)]
      );
    }

    await client.query(
      `INSERT INTO roles (id, name, description, permissions, created_at, updated_at)
       VALUES ($1, 'outsider', 'Self-registered users with limited access to shop and support', NULL, NOW(), NOW())`,
      [OUTSIDER_ROLE_ID]
    );

    await client.query(
      `INSERT INTO roles (id, name, description, permissions, created_at, updated_at)
       VALUES ($1, 'trusted_customer', 'Verified customers eligible for pay-at-center', NULL, NOW(), NOW())`,
      [TRUSTED_CUSTOMER_ROLE_ID]
    );

    await client.query(`
      INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
      VALUES
        ('EUR', 'Euro', '€', true, 1.0000, true, 2),
        ('USD', 'US Dollar', '$', true, 1.1000, false, 2),
        ('TRY', 'Turkish Lira', '₺', true, 32.5000, false, 2),
        ('GBP', 'British Pound', '£', true, 0.8500, false, 2),
        ('CAD', 'Canadian Dollar', 'C$', false, 1.4500, false, 2),
        ('AUD', 'Australian Dollar', 'A$', false, 1.6500, false, 2)
      ON CONFLICT (currency_code) DO NOTHING
    `);

    await client.query(`
      INSERT INTO settings (key, value, description, updated_at) VALUES
        ('security.max_failed_logins', '5'::jsonb, 'Maximum failed login attempts before account lock', NOW()),
        ('security.account_lock_duration', '1800'::jsonb, 'Account lock duration in seconds (30 minutes)', NOW()),
        ('security.password_min_length', '8'::jsonb, 'Minimum password length', NOW()),
        ('security.password_require_special', 'true'::jsonb, 'Require special characters in passwords', NOW()),
        ('security.session_timeout', '86400'::jsonb, 'Session timeout in seconds (24 hours)', NOW()),
        ('security.2fa_required_for_admin', 'true'::jsonb, 'Require 2FA for admin operations', NOW()),
        ('security.api_rate_limit', '100'::jsonb, 'API rate limit per minute per IP', NOW()),
        ('business_info', '{"name":"Plannivo Business Center","email":"info@plannivo.com","phone":"","address":""}'::jsonb, 'Business information', NOW()),
        ('booking_defaults', '{"defaultDuration":120,"allowedDurations":[60,90,120,150,180]}'::jsonb, 'Default booking durations', NOW()),
        ('defaultCurrency', '"EUR"'::jsonb, 'Default currency', NOW()),
        ('allowed_registration_currencies', '["EUR","USD","TRY"]'::jsonb, 'Currencies available during registration', NOW())
      ON CONFLICT (key) DO NOTHING
    `);

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const { rows: adminRole } = await client.query(
      `SELECT id FROM roles WHERE name = 'admin' LIMIT 1`
    );
    if (!adminRole.length) {
      throw new Error('admin role missing after seed');
    }

    const { rows: userRows } = await client.query(
      `INSERT INTO users (
        email, password_hash, name, first_name, last_name, preferred_currency, role_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'EUR', $6, NOW(), NOW())
      RETURNING id`,
      [ADMIN_EMAIL, passwordHash, 'Admin', 'Admin', 'User', adminRole[0].id]
    );

    const userId = userRows[0].id;
    if (await tableExists(client, 'wallet_balances')) {
      await client.query(
        `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount)
         VALUES ($1, 'EUR', 0, 0, 0)
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [userId]
      );
    }

    await client.query('COMMIT');
    console.log(`Done. Admin user: ${ADMIN_EMAIL} (role: admin). Schema + migrations preserved.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
