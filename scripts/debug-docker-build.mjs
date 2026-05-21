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

// 1. cgroup memory.events for recent docker containers
await run('cgroup v2 memory.events for failed build', `
  find /sys/fs/cgroup/system.slice/docker* /sys/fs/cgroup/system.slice/*docker* -name "memory.events" -newer /sys/fs/cgroup -mmin -60 2>/dev/null | head -5 | while read f; do
    echo "===== $f ====="
    cat "$f" 2>/dev/null
  done
`);

// 2. Check journal for kernel events around the failure (11:57)
await run('journalctl --dmesg around 11:57', "journalctl --dmesg --since '2026-05-18 11:55' --until '2026-05-18 12:00' --no-pager 2>/dev/null | tail -30");

// 3. Check the FULL journal (all priorities) around 11:57
await run('journalctl all-priorities around 11:57', "journalctl --since '2026-05-18 11:55' --until '2026-05-18 12:00' --no-pager 2>/dev/null | grep -iE 'kill|oom|memory|signal|docker|build' | tail -30");

// 4. systemd memory accounting on docker.service
await run('docker.service systemd memory limits', 'systemctl show docker --no-pager 2>/dev/null | grep -iE "memory|tasks|kill" | head -15');

// 5. The actual Dockerfile that ran
await run('package-lock.json size on server', `wc -l ${secrets.path}/package-lock.json 2>&1; ls -lh ${secrets.path}/package-lock.json 2>&1`);

// 6. Try to reproduce — pull the base image, run npm ci with verbose
await run('try reproducing locally (just resolve, no install)', `
  cd ${secrets.path}
  # Just check if npm ci would even start okay with detailed output
  docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "
    echo '=== free memory before ===';
    free -h;
    echo '=== npm version ===';
    npm --version;
    echo '=== running npm ci with --loglevel=info ===';
    npm ci --omit=dev --no-audit --no-fund --loglevel=info 2>&1 | tail -30;
    echo '=== exit code: '$?' ===';
    free -h
  " 2>&1 | tail -50
`, { execOptions: { pty: false }, options: { execTimeout: 600000 } });

ssh.dispose();
