/* Apply specific DB migrations from backend/db/migrations directly to the active database.
   Safe to run multiple times due to IF NOT EXISTS; also records in schema_migrations. */
import pg from 'pg';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT,
      checksum TEXT,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      migration_name TEXT,
      executed_at TIMESTAMPTZ
    );
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS filename TEXT;
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS migration_name TEXT;
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='schema_migrations' AND column_name='migration_name' AND is_nullable='NO'
      ) THEN
        EXECUTE 'ALTER TABLE schema_migrations ALTER COLUMN migration_name DROP NOT NULL';
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_idx ON schema_migrations(filename);
  `);
}

async function applySqlFile(client, filename) {
  const migrationsPath = path.join(__dirname, '..', 'db', 'migrations');
  const fullPath = path.join(migrationsPath, filename);
  const sql = await fs.readFile(fullPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  // Skip if already applied by filename
  const { rows } = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1 OR migration_name = $1',
    [filename]
  );
  if (rows.length) {
    console.log(`Skipping already applied: ${filename}`);
    return;
  }

  // Execute SQL (may contain multiple statements)
  await client.query(sql);

  // Record in ledger
  await client.query(
    'INSERT INTO schema_migrations (filename, checksum, migration_name) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
    [filename, checksum, filename]
  );
  console.log(`Applied: ${filename}`);
}

(async () => {
  const client = await pool.connect();
  try {
    await ensureLedger(client);
    await applySqlFile(client, 'add_package_hours_used_to_booking_participants.sql');
    await applySqlFile(client, 'add_cash_hours_used_to_booking_participants.sql');
  await applySqlFile(client, '009_create_spare_parts_orders.sql');
    console.log('Done applying migrations.');
  } catch (e) {
    console.error('Migration apply error:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})();
