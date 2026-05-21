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

await run('free memory', 'free -h');
await run('swap status', 'swapon --show; cat /proc/swaps');
await run('docker info memory', "docker info 2>/dev/null | grep -iE 'memory|swap|total memory'");
await run('container memory limits', "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'");
await run('disk usage', 'df -h / | head -3');
await run('node version on host', 'node --version 2>&1 || echo "no host node"');
await run('OOM in dmesg recent', 'dmesg --since "10 minutes ago" 2>/dev/null | grep -iE "out of memory|killed process|oom" | tail -10');

ssh.dispose();
