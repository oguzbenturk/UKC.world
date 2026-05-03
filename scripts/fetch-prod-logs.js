// One-shot: pull recent backend logs from prod and grep for PDF / bill errors.
// Read-only — does not modify the prod server.
import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({
  host: secrets.host,
  username: secrets.user,
  password: secrets.password,
  readyTimeout: 30000,
});

const remotePath = secrets.path;
const COMPOSE = `docker-compose --project-name plannivo -f docker-compose.production.yml`;

async function run(cmd, label) {
  const r = await ssh.execCommand(`cd ${remotePath} && ${cmd}`);
  console.log(`\n========== ${label} ==========`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error('[stderr]', r.stderr);
}

// Last 500 lines of backend logs, then a focused grep for PDF/bill/export.
await run(`${COMPOSE} logs --tail=500 backend 2>&1 | tail -200`, 'Backend tail (last ~200 lines)');
await run(`${COMPOSE} logs --tail=2000 backend 2>&1 | grep -iE 'pdf|bill|export|puppeteer|chromium|out of memory|oom|killed' | tail -80`, 'PDF/bill grep');
await run(`${COMPOSE} logs --tail=2000 backend 2>&1 | grep -iE 'error|fatal|unhandled|crash' | tail -50`, 'Error grep');
await run(`${COMPOSE} ps`, 'Container status');

ssh.dispose();
process.exit(0);
