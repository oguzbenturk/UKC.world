#!/usr/bin/env node
/**
 * dev-demo.js — run the normal dev setup (Vite :3000 + backend :4000) against the
 * local `plannivo_demo` database (copied by `npm run db:sync:demo`) instead of
 * `plannivo_dev`. backend/db.js reads LOCAL_DATABASE_URL before DATABASE_URL.
 *
 * Before starting it:
 *  1. checks that the local DB container runs and the demo database exists,
 *  2. applies pending migrations to the demo database (production gets them on
 *     deploy; without this the demo copy falls behind the code),
 *  3. flushes the local Redis API cache, because cached responses from the other
 *     database would otherwise be served.
 */
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_CONTAINER = 'plannivo-dev-db';
const REDIS_CONTAINER = 'plannivo-dev-redis';
const url = process.env.DEMO_DATABASE_URL || 'postgresql://plannivo:password@localhost:5432/plannivo_demo';
const parsed = new URL(url);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const dbUser = decodeURIComponent(parsed.username || 'plannivo');

const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

const docker = (args) => spawnSync('docker', args, { encoding: 'utf-8' });

// 1. Container + database
const inspect = docker(['inspect', DB_CONTAINER, '--format', '{{.State.Status}}']);
if (inspect.error) fail('Docker is not available — start Docker Desktop, then run: npm run db:dev:up');
if (inspect.stdout.trim() !== 'running') fail(`Local DB container ${DB_CONTAINER} is not running — run: npm run db:dev:up`);

// psql without -d connects to a database named after the user, which does not exist
// locally — so ask the always-present maintenance database.
const exists = docker(['exec', DB_CONTAINER, 'psql', '-U', dbUser, '-d', 'postgres', '-Atc',
  `select 1 from pg_database where datname = '${dbName.replace(/'/g, "''")}'`]);
if (exists.status !== 0) fail(`Could not query the local database server:\n${(exists.stderr || exists.stdout).trim()}`);
if (exists.stdout.trim() !== '1') fail(`Local database ${dbName} not found — run: npm run db:sync:demo`);

const env = { ...process.env, LOCAL_DATABASE_URL: url };

// 2. Migrations
console.log(`🗄  Applying pending migrations to ${dbName}…`);
const migrate = spawnSync(process.execPath, [path.join(root, 'backend', 'migrate.js'), 'up'], {
  cwd: root,
  env,
  encoding: 'utf-8',
});
if (migrate.status !== 0) {
  const output = `${migrate.stdout || ''}\n${migrate.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
  fail(`Migrations failed on ${dbName}:\n${output}`);
}
const applied = (`${migrate.stdout}${migrate.stderr}`.match(/Applying (?:non-)?transactional migration/g) || []).length;
console.log(applied ? `   ✓ ${applied} new migration(s) applied` : '   ✓ up to date');

// 3. Cache
docker(['exec', REDIS_CONTAINER, 'redis-cli', 'FLUSHALL']);

console.log(`🧪 Dev against DEMO data (${dbName}) — logins: demo-aydin/DEMO-LOGINS.md`);

// One command string: passing an args array together with shell: true is deprecated (DEP0190).
const child = spawn('npm run dev', { cwd: root, stdio: 'inherit', shell: true, env });
child.on('exit', (code) => process.exit(code ?? 0));
