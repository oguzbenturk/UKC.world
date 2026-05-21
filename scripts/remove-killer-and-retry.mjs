#!/usr/bin/env node
// Remove the rogue `observed.service` + `/usr/local/bin/free_proc.sh` and verify
// the build that's been failing now succeeds.

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

// 1. Backup the rogue files so we can recover if needed
await run('backup observed.service + free_proc.sh to /root/.observed_backup_2026-05-18', `
  mkdir -p /root/.observed_backup_2026-05-18
  cp /etc/systemd/system/observed.service /root/.observed_backup_2026-05-18/ 2>/dev/null
  cp /usr/local/bin/free_proc.sh /root/.observed_backup_2026-05-18/ 2>/dev/null
  ls -la /root/.observed_backup_2026-05-18/
`);

// 2. Stop, disable, and remove
await run('stop observed', 'systemctl stop observed 2>&1; echo "active=$(systemctl is-active observed)"');
await run('disable observed', 'systemctl disable observed 2>&1');
await run('remove unit file + script', 'rm -f /etc/systemd/system/observed.service /usr/local/bin/free_proc.sh && systemctl daemon-reload && echo "removed"');
await run('confirm gone', 'systemctl status observed 2>&1 | head -5; echo ---; ls -la /usr/local/bin/free_proc.sh 2>&1; echo ---; ls -la /etc/systemd/system/observed.service 2>&1');

// 3. Quick build verification
await run('quick npm install test (3rd party docker, should now succeed)', `
  TMPDIR=\$(mktemp -d)
  cp ${secrets.path}/package*.json "\$TMPDIR/"
  docker run --rm -v "\$TMPDIR:/app" -w /app node:20-alpine sh -c "timeout 240 npm install --omit=dev --no-audit --no-fund --ignore-scripts --maxsockets=4 2>&1 | tail -5; echo --- exit=\\\$?"
  ls "\$TMPDIR/" 2>&1 | head -5
  rm -rf "\$TMPDIR"
`, { options: { execTimeout: 600000 } });

// 4. Now the real backend image build (the one that's been failing)
await run('REAL backend build (docker-compose, the exact path push-all uses)', `cd ${secrets.path} && export COMPOSE_PROJECT_NAME=plannivo && docker-compose -f docker-compose.production.yml build backend 2>&1 | tail -25`, { options: { execTimeout: 1500000 } });

await run('image exists?', 'docker images plannivo_backend --format "{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}"');

ssh.dispose();
