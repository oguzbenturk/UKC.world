#!/usr/bin/env node
/**
 * dev-akyaka.js
 * Launches the Akyaka local dev stack: backend on :4001, frontend on :3001,
 * using backend/.env.akyaka.development and the akyaka_dev Postgres on :5434.
 *
 * Strictly isolated from Plannivo UKC dev (which uses :4000/:3000/:5432). Runs
 * both concurrently — no shared state.
 *
 * Safety rails (startup validation):
 *   - Refuses to start if BACKEND_ENV_FILE would point at Plannivo's env file.
 *   - Refuses to start if local Akyaka DB container is not running.
 *
 * Usage:
 *   node scripts/dev-akyaka.js
 *   npm run dev:akyaka
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, '..');

const BACKEND_ENV_FILE = '.env.akyaka.development';
const BACKEND_PORT = '4001';
const FRONTEND_PORT = '3001';
const DB_CONTAINER = 'plannivo-akyaka-dev-db';

const envFullPath = path.join(cwd, 'backend', BACKEND_ENV_FILE);
if (!fs.existsSync(envFullPath)) {
  console.error(`❌ Missing ${envFullPath}`);
  console.error('   Copy the template and fill in values:');
  console.error('     cp backend/.env.akyaka.development.example backend/.env.akyaka.development');
  process.exit(1);
}

// Read a few keys out of the env file to validate isolation
function parseEnvFile(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

const parsed = parseEnvFile(envFullPath);
const dbUrl = parsed.DATABASE_URL || '';

if (/:5432\//.test(dbUrl) || /plannivo_dev/.test(dbUrl)) {
  console.error('❌ Safety check failed: DATABASE_URL in backend/.env.akyaka.development');
  console.error('   points at Plannivo UKC\'s dev DB. Change it to akyaka_dev on port 5434.');
  console.error(`   Got: ${dbUrl}`);
  process.exit(1);
}

// Check Akyaka local DB container is running
const dbStatus = spawnSync('docker', ['inspect', DB_CONTAINER, '--format', '{{.State.Status}}'], {
  encoding: 'utf-8',
});
if (dbStatus.stdout.trim() !== 'running') {
  console.error(`❌ ${DB_CONTAINER} is not running.`);
  console.error('   Start it first: npm run db:akyaka:up');
  process.exit(1);
}

console.log('🚀 Starting Akyaka dev stack');
console.log(`   Backend   :${BACKEND_PORT}  (env: backend/${BACKEND_ENV_FILE})`);
console.log(`   Frontend  :${FRONTEND_PORT}  (proxies /api → :${BACKEND_PORT})`);
console.log(`   Database  :${DB_CONTAINER}  (host port 5434, db akyaka_dev)`);
console.log('');

// Windows + npm: prefix + pass-through envs cleanly via spawn
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const backendEnv = {
  ...process.env,
  BACKEND_ENV_FILE,
  // server.js listens on BACKEND_API_PORT (falls back to 4000). Set both for safety.
  BACKEND_API_PORT: BACKEND_PORT,
  PORT: BACKEND_PORT,
};

const frontendEnv = {
  ...process.env,
  VITE_DEV_PORT: FRONTEND_PORT,
  BACKEND_API_URL: `http://localhost:${BACKEND_PORT}`,
};

const children = [];

function launch(label, cmd, args, env, color) {
  const child = spawn(cmd, args, { cwd, env, shell: true });
  const prefix = `\x1b[${color}m[${label}]\x1b[0m `;

  child.stdout.on('data', (d) => process.stdout.write(d.toString().split('\n').map(l => l ? prefix + l : l).join('\n')));
  child.stderr.on('data', (d) => process.stderr.write(d.toString().split('\n').map(l => l ? prefix + l : l).join('\n')));
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    children.filter(c => c !== child).forEach(c => { try { c.kill(); } catch { /* noop */ } });
    process.exit(code ?? 1);
  });

  children.push(child);
  return child;
}

launch('backend',  npmCmd, ['run', 'dev', '--prefix', 'backend'], backendEnv, '36');
launch('frontend', npmCmd, ['run', 'dev:frontend'],               frontendEnv, '35');

function shutdown() {
  for (const c of children) { try { c.kill(); } catch { /* noop */ } }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
