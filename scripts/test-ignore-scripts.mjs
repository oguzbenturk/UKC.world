import { NodeSSH } from 'node-ssh';
import fs from 'fs';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, tryKeyboard: true, readyTimeout: 60000 });

async function run(label, cmd, opts = {}) {
  console.log(`\n--- ${label} ---`);
  const r = await ssh.execCommand(cmd, opts);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('[stderr]', r.stderr);
  return r;
}

// 1. npm install with --ignore-scripts
await run('npm install with --ignore-scripts', `docker run --rm -v ${secrets.path}:/app -w /app node:20-alpine sh -c "npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefer-offline 2>&1 | tail -10; echo exit=\\\$?"`, { options: { execTimeout: 600000 } });

// 2. npm install with --ignore-scripts AND debian image (glibc not musl)
await run('npm install on node:20 (glibc not alpine)', `docker run --rm -v ${secrets.path}:/app -w /app node:20-slim sh -c "npm install --omit=dev --no-audit --no-fund --ignore-scripts 2>&1 | tail -10; echo exit=\\\$?"`, { options: { execTimeout: 900000 } });

ssh.dispose();
