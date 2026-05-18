import { NodeSSH } from 'node-ssh';
import fs from 'fs';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, tryKeyboard: true, readyTimeout: 30000 });

async function run(label, cmd) {
  console.log(`\n--- ${label} ---`);
  const r = await ssh.execCommand(cmd);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('[stderr]', r.stderr);
}

await run('host nginx version & process', 'nginx -v 2>&1; pgrep -a nginx | head -5');
await run('host nginx -T (full effective config) listing files', 'nginx -T 2>/dev/null | grep -E "^# configuration file|server_name|ssl_certificate" | head -80');
await run('grep plannivo across nginx config tree', 'grep -rEn "plannivo\\.com|ssl_certificate" /etc/nginx/ 2>/dev/null | grep -v "^.*:#" | head -60');
await run('list /etc/nginx/sites-enabled', 'ls -la /etc/nginx/sites-enabled/ 2>/dev/null');
await run('list /etc/nginx/conf.d', 'ls -la /etc/nginx/conf.d/ 2>/dev/null');

ssh.dispose();
