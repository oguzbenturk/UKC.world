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

// 1. Find when the failed build happened (look at recent docker images / build logs)
await run('docker daemon info — memory & cgroup', "docker info 2>/dev/null | grep -iE 'memory|swap|cgroup|kernel|runtime|server version|backing fs'");
await run('docker daemon config', 'cat /etc/docker/daemon.json 2>/dev/null || echo "no daemon.json"');

// 2. Recent OOM events — try a wider window
await run('journalctl OOM last 1h', 'journalctl --since "1 hour ago" 2>/dev/null | grep -iE "oom|killed process|out of memory|invoked oom" | tail -20');
await run('dmesg OOM last hours (full buffer)', 'dmesg 2>/dev/null | grep -iE "out of memory|killed process|invoked oom-killer|memory cgroup out of memory" | tail -20');

// 3. /var/log for OOM signs
await run('syslog OOM', 'tail -2000 /var/log/syslog 2>/dev/null | grep -iE "oom|killed.*memory|invoked oom" | tail -10');
await run('kern.log OOM', 'tail -2000 /var/log/kern.log 2>/dev/null | grep -iE "oom|killed.*memory|invoked oom" | tail -10');

// 4. Docker build cache
await run('docker images (recent)', 'docker images --format "{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}" 2>/dev/null | head -10');
await run('docker build/system df', 'docker system df 2>/dev/null');

// 5. Recent memory pressure
await run('current memory + swap', 'free -h && cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree" | head -10');
await run('peak memory pressure (top processes by RAM)', 'ps aux --sort=-rss | head -10');

// 6. Recent docker daemon log
await run('docker daemon log tail', 'journalctl -u docker --since "1 hour ago" --no-pager 2>/dev/null | tail -40');

// 7. The actual recent build attempt
await run('docker ps -a (recent exited)', 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}" 2>/dev/null | head -15');

ssh.dispose();
