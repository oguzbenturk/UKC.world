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

await run('ulimit inside container', 'docker run --rm node:20-alpine sh -c "ulimit -a" 2>&1');

// Check docker.service for any MemoryHigh/MemoryMax limits via systemd
await run('docker.service ALL memory settings', 'systemctl show docker --no-pager 2>/dev/null | grep -iE "memory" | head -20');
await run('system.slice memory settings', 'systemctl show system.slice --no-pager 2>/dev/null | grep -iE "memory" | head -10');
await run('current docker.service memory.current vs system memory', 'cat /sys/fs/cgroup/system.slice/docker.service/memory.current 2>/dev/null; echo "/15233122304 (max possible)"; echo "---"; cat /sys/fs/cgroup/system.slice/docker.service/memory.max 2>/dev/null');

// What if there's something specific to docker0 bridge / iptables conntrack
await run('conntrack stats', 'cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null; echo " / "; cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null');

// Try a SIMPLE long-running container to see if normal containers survive
await run('long-running container test (sleep 10)', 'docker run --rm --name longrun_test node:20-alpine sleep 10 && echo "survived 10s"');

// Try a CPU + network intensive task without npm
await run('curl 100 packages in node container', 'docker run --rm node:20-alpine sh -c "for i in $(seq 1 100); do wget -q -O /dev/null https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz; done; echo done" 2>&1 | tail -5');

// Check if the issue is specific to writing to overlay fs
await run('write 100MB to container disk', 'docker run --rm node:20-alpine sh -c "dd if=/dev/zero of=/tmp/test.bin bs=1M count=100 2>&1" | tail -3');

ssh.dispose();
