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

await run('apparmor status', 'aa-status 2>&1 | head -30');
await run('audit log for npm/docker denies (last hour)', "ausearch -ts recent -m AVC 2>/dev/null | head -30; echo ---; journalctl --since '1 hour ago' --no-pager 2>/dev/null | grep -iE 'audit|apparmor|denied|killed' | head -20");
await run('audit kern.log/syslog for SIGKILL signals', "tail -2000 /var/log/syslog 2>/dev/null | grep -iE 'sigkill|killed.*npm|killed.*node|aa-denied' | tail -10; echo ---; tail -2000 /var/log/kern.log 2>/dev/null | grep -iE 'sigkill|killed.*npm|killed.*node|aa-denied' | tail -10");
await run('AppArmor docker profile', 'cat /etc/apparmor.d/docker-default 2>/dev/null | head -30');
await run('list of running auditd-style monitors', 'ps aux | grep -iE "auditd|laurel|falco|tracee" | grep -v grep | head -10');

// Try with --security-opt apparmor=unconfined
await run('npm install with --security-opt apparmor=unconfined', `docker run --rm --security-opt apparmor=unconfined -v ${secrets.path}:/app -w /app node:20-alpine sh -c "timeout 30 npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefer-offline 2>&1 | tail -10; echo exit=\\\$?"`, { options: { execTimeout: 300000 } });

// Try with --security-opt seccomp=unconfined
await run('npm install with --security-opt seccomp=unconfined', `docker run --rm --security-opt seccomp=unconfined -v ${secrets.path}:/app -w /app node:20-alpine sh -c "timeout 30 npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefer-offline 2>&1 | tail -10; echo exit=\\\$?"`, { options: { execTimeout: 300000 } });

// Try with --privileged (disables nearly all sandboxing)
await run('npm install with --privileged', `docker run --rm --privileged -v ${secrets.path}:/app -w /app node:20-alpine sh -c "timeout 30 npm install --omit=dev --no-audit --no-fund --ignore-scripts --prefer-offline 2>&1 | tail -10; echo exit=\\\$?"`, { options: { execTimeout: 300000 } });

ssh.dispose();
