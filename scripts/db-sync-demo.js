#!/usr/bin/env node
/**
 * db-sync-demo.js
 * Copies the DEMO database (aydin.plannivo.com, fictional data) into a separate
 * local database `plannivo_demo` inside the local dev container, plus the demo's
 * catalogue/staff images into backend/uploads (existing files are never overwritten).
 *
 * Why: develop against realistic data WITHOUT copying real customer data (KVKK).
 * The regular dev DB (plannivo_dev) is not touched.
 *
 * Usage:
 *   npm run db:sync:demo      # copy demo DB + images
 *   npm run dev:demo          # run frontend + backend against plannivo_demo
 *
 * Prerequisites: local dev DB running (npm run db:dev:up), .deploy.secrets.json with
 * host/user and privateKeyPath (SSH key login).
 */

import { NodeSSH } from 'node-ssh';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(root, '.deploy.secrets.json'), 'utf-8'));
const LOCAL_CONTAINER = 'plannivo-dev-db';
const LOCAL_DB = 'plannivo_demo';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plannivo-demo-'));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

async function main() {
  const status = spawnSync('docker', ['inspect', LOCAL_CONTAINER, '--format', '{{.State.Status}}'], { encoding: 'utf-8' }).stdout.trim();
  if (status !== 'running') throw new Error(`Local DB container ${LOCAL_CONTAINER} is not running — run: npm run db:dev:up`);

  const keyPath = (secrets.privateKeyPath || secrets.keyPath || '').replace(/^~(?=$|[\\/])/, os.homedir());
  const ssh = new NodeSSH();
  await ssh.connect({
    host: secrets.host,
    username: secrets.user || 'root',
    ...(keyPath ? { privateKey: fs.readFileSync(keyPath, 'utf-8') } : { password: secrets.password }),
    readyTimeout: 20000,
  });

  try {
    console.log('📦 Dumping demo database on the server…');
    const remoteDump = `/tmp/aydin_demo_${Date.now()}.dump`;
    const remoteTar = `/tmp/aydin_demo_uploads_${Date.now()}.tar.gz`;
    let r = await ssh.execCommand(`docker exec aydin_db_1 pg_dump -U aydin -Fc aydin_demo > ${remoteDump} && ls -la ${remoteDump}`);
    if (r.code !== 0) throw new Error(`pg_dump failed: ${r.stderr}`);
    console.log('🖼  Packing demo images (avatars, catalogue)…');
    r = await ssh.execCommand(`docker run --rm -v aydin_uploads_data:/v:ro alpine tar czf - -C /v . > ${remoteTar}`);
    if (r.code !== 0) throw new Error(`uploads tar failed: ${r.stderr}`);

    const localDump = path.join(tmp, 'demo.dump');
    const localTar = path.join(tmp, 'uploads.tar.gz');
    console.log('⬇️  Downloading…');
    await ssh.getFile(localDump, remoteDump);
    await ssh.getFile(localTar, remoteTar);
    await ssh.execCommand(`rm -f ${remoteDump} ${remoteTar}`);
  } finally {
    ssh.dispose();
  }

  console.log(`🗄  Restoring into local database ${LOCAL_DB}…`);
  run('docker', ['cp', path.join(tmp, 'demo.dump'), `${LOCAL_CONTAINER}:/tmp/demo.dump`]);
  run('docker', ['exec', LOCAL_CONTAINER, 'dropdb', '-U', 'plannivo', '--if-exists', '--force', LOCAL_DB]);
  run('docker', ['exec', LOCAL_CONTAINER, 'createdb', '-U', 'plannivo', LOCAL_DB]);
  spawnSync('docker', ['exec', LOCAL_CONTAINER, 'pg_restore', '-U', 'plannivo', '-d', LOCAL_DB, '--no-owner', '--no-acl', '/tmp/demo.dump'], { encoding: 'utf-8' });
  run('docker', ['exec', LOCAL_CONTAINER, 'rm', '-f', '/tmp/demo.dump']);
  const users = run('docker', ['exec', LOCAL_CONTAINER, 'psql', '-U', 'plannivo', '-d', LOCAL_DB, '-Atc', 'select count(*) from users']).trim();
  console.log(`   ✓ ${LOCAL_DB}: ${users} users`);

  console.log('🖼  Adding demo images to backend/uploads (existing files kept)…');
  const uploads = path.join(root, 'backend', 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  // --skip-old-files: never overwrite a local file with the same name
  run('tar', ['-xzf', path.relative(uploads, path.join(tmp, 'uploads.tar.gz')).replace(/\\/g, '/'), '--skip-old-files'], { cwd: uploads });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n✅ Done. Start the app against the demo data with:  npm run dev:demo');
  console.log('   Logins: demo-aydin/DEMO-LOGINS.md (same as aydin.plannivo.com)');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
