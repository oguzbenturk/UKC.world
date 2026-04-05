#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const [, , rawCommand = 'up'] = process.argv;
const command = rawCommand.toLowerCase();

const ensureLedger = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT,
      checksum TEXT,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      migration_name TEXT,
      executed_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_idx ON schema_migrations(filename);
  `);
};

const listMigrationFiles = async (dir) => {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    return dirents
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const run = async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.join(__dirname, 'db', 'migrations');

  if (command === 'up') {
    // Set CLI mode to prevent auto-run on import, then run migrations ourselves
    process.env.MIGRATION_CLI_MODE = 'true';
    process.env.RUN_DB_MIGRATIONS = 'true';
    const { runDbMigrations, pool } = await import('./db.js');

    try {
      await runDbMigrations();
  console.log('Database migrations applied successfully.');
      process.exitCode = 0;
    } catch (error) {
  console.error('Migration execution failed:', error.message || error);
      process.exitCode = 1;
    } finally {
      try {
        await pool.end();
      } catch (error) {
        if (process.env.DEBUG_MIGRATIONS === 'true') {
          console.warn('Failed to close database pool cleanly:', error.message || error);
        }
      }
    }

    return;
  }

  if (command === 'status') {
    process.env.RUN_DB_MIGRATIONS = process.env.RUN_DB_MIGRATIONS || 'false';
    const { pool } = await import('./db.js');
    const client = await pool.connect();

    try {
      await ensureLedger(client);
      const files = await listMigrationFiles(migrationsDir);
      const appliedResult = await client.query('SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at ASC');
      const appliedSet = new Set(appliedResult.rows.map((row) => row.filename));

  console.log(`Found ${files.length} migration files.`);
  console.log(`Applied migrations: ${appliedSet.size}`);

      const pending = files.filter((file) => !appliedSet.has(file));
      if (pending.length === 0) {
        console.log('All migrations are up to date.');
      } else {
        console.log('Pending migrations:');
        pending.forEach((file) => console.log(`  - ${file}`));
      }

      process.exitCode = 0;
    } catch (error) {
  console.error('Failed to read migration status:', error.message || error);
      process.exitCode = 1;
    } finally {
      client.release();
      await pool.end();
    }

    return;
  }

  console.error(`Unknown command "${rawCommand}". Use "up" or "status".`);
  process.exitCode = 1;
};

run().catch((error) => {
  console.error('Migration CLI crashed:', error.message || error);
  process.exit(1);
});
