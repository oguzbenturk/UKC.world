#!/usr/bin/env node
/**
 * db-sync-from-prod.js
 * Copies the production PostgreSQL database to your local dev container.
 *
 * Usage:
 *   node scripts/db-sync-from-prod.js
 *   npm run db:sync
 *
 * Prerequisites:
 *   - Local dev DB must be running: npm run db:dev:up
 *   - .deploy.secrets.json must exist (SSH credentials)
 */

import { NodeSSH } from 'node-ssh';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, '..');
const secretsPath = path.join(cwd, '.deploy.secrets.json');
const dumpPath = path.join(cwd, 'prod_dump.sql');

// ── Validate prerequisites ────────────────────────────────────────────────────
if (!fs.existsSync(secretsPath)) {
  console.error('❌ .deploy.secrets.json not found. Cannot connect to production.');
  process.exit(1);
}

const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));

function checkLocalContainer() {
  const result = spawnSync('docker', ['inspect', 'plannivo-dev-db', '--format', '{{.State.Status}}'], {
    encoding: 'utf-8',
  });
  const status = result.stdout.trim();
  if (status !== 'running') {
    console.error('❌ Local DB container is not running.');
    console.error('   Start it first with: npm run db:dev:up');
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Checking local database container...');
  checkLocalContainer();
  console.log('   ✓ plannivo-dev-db is running');

  console.log('\n🔌 Connecting to production server...');
  const ssh = new NodeSSH();
  await ssh.connect({
    host: secrets.host,
    username: secrets.user || 'root',
    password: secrets.password,
    readyTimeout: 20000,
  });

  try {
    // 1. Dump production DB
    console.log('📦 Dumping production database (may take 10-30 seconds)...');
    const dump = await ssh.execCommand(
      'docker exec plannivo_db_1 pg_dump -U plannivo --clean --if-exists plannivo'
    );

    if (dump.code !== 0) {
      throw new Error(`pg_dump failed:\n${dump.stderr}`);
    }

    if (!dump.stdout || dump.stdout.length < 100) {
      throw new Error('pg_dump returned empty output. Check the production container is healthy.');
    }

    if (!dump.stdout.includes('PostgreSQL database dump')) {
      throw new Error('pg_dump output does not look like a valid PostgreSQL dump. Aborting to protect local DB.');
    }

    fs.writeFileSync(dumpPath, dump.stdout, 'utf-8');
    const sizeKb = Math.round(dump.stdout.length / 1024);
    console.log(`   ✓ Dump captured (${sizeKb} KB)`);

    // 2. Copy dump into local container
    console.log('\n📥 Restoring to local database...');
    execSync(`docker cp "${dumpPath}" plannivo-dev-db:/tmp/prod_dump.sql`, { stdio: 'pipe' });

    // 3. Restore — suppress verbose SQL output, only show real errors
    const restore = spawnSync(
      'docker',
      ['exec', 'plannivo-dev-db', 'psql', '-U', 'plannivo', 'plannivo_dev', '-f', '/tmp/prod_dump.sql', '-v', 'ON_ERROR_STOP=0'],
      { encoding: 'utf-8' }
    );

    if (restore.status !== 0) {
      const errLines = (restore.stderr || '')
        .split('\n')
        .filter(l => l.includes('ERROR') && !l.includes('does not exist'));
      if (errLines.length > 0) {
        console.warn('   ⚠️  Some restore warnings (usually safe with --clean):');
        errLines.slice(0, 5).forEach(l => console.warn('      ', l));
      }
    }

    // 4. Cleanup inside container and locally
    execSync('docker exec plannivo-dev-db rm /tmp/prod_dump.sql', { stdio: 'pipe' });
    fs.unlinkSync(dumpPath);

    console.log('\n✅ Sync complete! Your local DB is now a copy of production.');
    console.log('   Local: postgresql://plannivo:password@localhost:5432/plannivo_dev');
    console.log('\n   Start dev server: npm run dev');
  } finally {
    ssh.dispose();
    // Clean up local dump file if it still exists (e.g. on error)
    if (fs.existsSync(dumpPath)) {
      fs.unlinkSync(dumpPath);
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Sync failed:', err.message);
  if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath);
  process.exit(1);
});
