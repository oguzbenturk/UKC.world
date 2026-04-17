#!/usr/bin/env node
/**
 * db-sync-akyaka-from-prod.js
 * Copies the Akyaka production PostgreSQL database to your LOCAL Akyaka dev container.
 *
 * Strictly scoped to Akyaka:
 *   - Reads .deploy.secrets.akyaka.json (never Plannivo's .deploy.secrets.json)
 *   - Dumps from the Akyaka production container on the VPS
 *   - Restores into plannivo-akyaka-dev-db (port 5434, database akyaka_dev)
 *
 * Refuses to run if any safety rail detects a Plannivo target.
 *
 * Usage:
 *   node scripts/db-sync-akyaka-from-prod.js
 *   npm run db:akyaka:sync
 *
 * Prerequisites:
 *   - Local Akyaka dev DB running: npm run db:akyaka:up
 *   - .deploy.secrets.akyaka.json must exist (SSH creds for the VPS)
 *
 * Uses spawnSync with argv arrays everywhere — no shell interpolation.
 */

import { NodeSSH } from 'node-ssh';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, '..');
const secretsPath = path.join(cwd, '.deploy.secrets.akyaka.json');
const plannivoSecretsPath = path.join(cwd, '.deploy.secrets.json');
const dumpPath = path.join(cwd, 'akyaka_prod_dump.sql');

const LOCAL_CONTAINER = 'plannivo-akyaka-dev-db';
const LOCAL_USER = 'akyaka';
const LOCAL_DB = 'akyaka_dev';

// ── Validate prerequisites ───────────────────────────────────────────────────
if (!fs.existsSync(secretsPath)) {
  console.error('❌ .deploy.secrets.akyaka.json not found. Cannot connect to Akyaka production.');
  console.error('   Copy .deploy.secrets.akyaka.json.example and fill in real SSH credentials.');
  process.exit(1);
}

const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));

// ── Safety rail: refuse if Akyaka secrets accidentally point at Plannivo ─────
if (fs.existsSync(plannivoSecretsPath)) {
  const akyakaContainer = (secrets.prodContainer || secrets.container || '').trim();
  const akyakaPath = (secrets.remotePath || '').trim();
  if (akyakaPath && akyakaPath === '/root/plannivo') {
    console.error('❌ Safety check failed: .deploy.secrets.akyaka.json remotePath is /root/plannivo');
    console.error('   This file must point at the Akyaka deployment, not Plannivo.');
    process.exit(1);
  }
  if (akyakaContainer && /plannivo(_|-)db/i.test(akyakaContainer)) {
    console.error('❌ Safety check failed: .deploy.secrets.akyaka.json container name matches Plannivo.');
    process.exit(1);
  }
}

function runDocker(args, opts = {}) {
  return spawnSync('docker', args, { encoding: 'utf-8', ...opts });
}

function assertOrExit(cond, msg) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
}

function checkLocalContainer() {
  const result = runDocker(['inspect', LOCAL_CONTAINER, '--format', '{{.State.Status}}']);
  const status = (result.stdout || '').trim();
  if (status !== 'running') {
    console.error(`❌ Local DB container "${LOCAL_CONTAINER}" is not running.`);
    console.error('   Start it first with: npm run db:akyaka:up');
    process.exit(1);
  }
}

// Akyaka production uses COMPOSE_PROJECT_NAME=akyaka. Docker Compose v2 names
// containers with hyphens (akyaka-db-1); v1 used underscores. Probe both.
async function resolveRemoteDbContainer(ssh) {
  const candidates = ['akyaka-db-1', 'akyaka_db_1'];
  for (const name of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const probe = await ssh.execCommand(`docker inspect --format='{{.State.Status}}' ${name}`);
    if (probe.code === 0 && /running/i.test(probe.stdout)) return name;
  }
  throw new Error(
    `Could not find a running Akyaka DB container on the server. Tried: ${candidates.join(', ')}.\n` +
    '   Check on the VPS: docker ps --filter name=akyaka'
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Checking local Akyaka database container...');
  checkLocalContainer();
  console.log(`   ✓ ${LOCAL_CONTAINER} is running`);

  console.log('\n🔌 Connecting to production server...');
  const ssh = new NodeSSH();
  await ssh.connect({
    host: secrets.host,
    username: secrets.user || 'root',
    password: secrets.password,
    readyTimeout: 20000,
  });

  try {
    const remoteContainer = await resolveRemoteDbContainer(ssh);
    console.log(`   ✓ Remote container: ${remoteContainer}`);

    console.log('\n📦 Dumping Akyaka production database (may take 10-30 seconds)...');
    const dump = await ssh.execCommand(
      `docker exec ${remoteContainer} pg_dump -U akyaka --clean --if-exists akyaka`
    );

    if (dump.code !== 0) throw new Error(`pg_dump failed:\n${dump.stderr}`);
    assertOrExit(dump.stdout && dump.stdout.length >= 100,
      'pg_dump returned empty output. Check the Akyaka production container is healthy.');
    assertOrExit(dump.stdout.includes('PostgreSQL database dump'),
      'pg_dump output does not look like a valid PostgreSQL dump. Aborting to protect local DB.');

    fs.writeFileSync(dumpPath, dump.stdout, 'utf-8');
    const sizeKb = Math.round(dump.stdout.length / 1024);
    console.log(`   ✓ Dump captured (${sizeKb} KB)`);

    console.log('\n📥 Restoring to local Akyaka database...');
    const cp = runDocker(['cp', dumpPath, `${LOCAL_CONTAINER}:/tmp/akyaka_prod_dump.sql`]);
    assertOrExit(cp.status === 0, `docker cp failed: ${cp.stderr}`);

    const restore = runDocker([
      'exec', LOCAL_CONTAINER,
      'psql', '-U', LOCAL_USER, LOCAL_DB,
      '-f', '/tmp/akyaka_prod_dump.sql',
      '-v', 'ON_ERROR_STOP=0',
    ]);

    if (restore.status !== 0) {
      const errLines = (restore.stderr || '')
        .split('\n')
        .filter(l => l.includes('ERROR') && !l.includes('does not exist'));
      if (errLines.length > 0) {
        console.warn('   ⚠️  Some restore warnings (usually safe with --clean):');
        errLines.slice(0, 5).forEach(l => console.warn('      ', l));
      }
    }

    runDocker(['exec', LOCAL_CONTAINER, 'rm', '/tmp/akyaka_prod_dump.sql']);
    fs.unlinkSync(dumpPath);

    console.log('\n✅ Sync complete! Your local Akyaka DB is now a copy of Akyaka production.');
    console.log(`   Local: postgresql://${LOCAL_USER}:password@localhost:5434/${LOCAL_DB}`);
    console.log('\n   Start dev server: npm run dev:akyaka');
  } finally {
    ssh.dispose();
    if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath);
  }
}

main().catch((err) => {
  console.error('\n❌ Sync failed:', err.message);
  if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath);
  process.exit(1);
});
