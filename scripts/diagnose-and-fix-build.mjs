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

// 1. Trigger a build in background and watch cgroup memory.events for the kill signal
await run('memory before', 'free -h');

// 2. Manual repro inside a long-running container so we can attach during the kill
await run('reproduce npm ci in long-running container with cgroup tracking', `
  # Use a sleep wrapper so we can examine if it dies
  docker run --rm --name nck_repro -v ${secrets.path}:/app -w /app node:20-alpine sh -c "
    set -e
    echo '--- node alive ---'
    node --version
    echo '--- pre-install free memory ---'
    free -h 2>/dev/null || cat /proc/meminfo | head -5
    echo '--- starting npm ci with strace-like loglevel=silly (tail) ---'
    npm ci --omit=dev --no-audit --no-fund --loglevel=verbose 2>&1 | head -100
    echo '--- exit code: '\\\$?
    echo '--- post-install free memory ---'
    free -h 2>/dev/null || cat /proc/meminfo | head -5
  " 2>&1 | tail -50
`, { options: { execTimeout: 600000 } });

// 3. Check oom.group counter on docker.service cgroup (cumulative — survives container death)
await run('docker.service cgroup memory.events', 'cat /sys/fs/cgroup/system.slice/docker.service/memory.events 2>/dev/null');
await run('init.scope cgroup memory.events', 'cat /sys/fs/cgroup/init.scope/memory.events 2>/dev/null');
await run('any cgroup with non-zero oom_kill counter', `find /sys/fs/cgroup -name memory.events 2>/dev/null | while read f; do
  oom=\$(grep '^oom_kill ' "\$f" 2>/dev/null | awk '{print \$2}')
  if [ -n "\$oom" ] && [ "\$oom" != "0" ]; then
    echo "\$f: oom_kill=\$oom"
  fi
done | head -20`);

ssh.dispose();
