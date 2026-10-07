#!/usr/bin/env node
/**
 * dev-demo.js — run the normal dev setup (Vite :3000 + backend :4000) against the
 * local `plannivo_demo` database (copied by `npm run db:sync:demo`) instead of
 * `plannivo_dev`. backend/db.js reads LOCAL_DATABASE_URL before DATABASE_URL.
 * The local API cache in Redis is flushed first, because cached responses from
 * the other database would otherwise be served.
 */
import { spawn, spawnSync } from 'child_process';

const url = process.env.DEMO_DATABASE_URL || 'postgresql://plannivo:password@localhost:5432/plannivo_demo';

const exists = spawnSync('docker', ['exec', 'plannivo-dev-db', 'psql', '-U', 'plannivo', '-Atc',
  "select 1 from pg_database where datname='plannivo_demo'"], { encoding: 'utf-8' });
if (exists.stdout.trim() !== '1') {
  console.error('❌ Local database plannivo_demo not found — run: npm run db:sync:demo');
  process.exit(1);
}

spawnSync('docker', ['exec', 'plannivo-dev-redis', 'redis-cli', 'FLUSHALL'], { stdio: 'ignore' });
console.log('🧪 Dev against DEMO data (plannivo_demo) — logins: demo-aydin/DEMO-LOGINS.md');

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, LOCAL_DATABASE_URL: url },
});
child.on('exit', (code) => process.exit(code ?? 0));
