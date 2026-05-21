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

await run('systemd-oomd status', 'systemctl status systemd-oomd --no-pager 2>&1 | head -20');
await run('systemd-oomd recent kills', 'journalctl -u systemd-oomd --since "1 hour ago" --no-pager 2>/dev/null | tail -40');
await run('any oomd kills today', 'journalctl --since "today" --no-pager 2>/dev/null | grep -iE "oomd|systemd-oomd|killed unit|killed scope" | tail -20');
await run('memory pressure now', 'cat /proc/pressure/memory 2>/dev/null');
await run('cgroup memory pressure for docker', 'cat /sys/fs/cgroup/system.slice/docker.service/memory.pressure 2>/dev/null');
await run('docker.service memory current/peak/swap', 'systemctl show docker --no-pager 2>/dev/null | grep -E "^Memory|^Tasks" | head -10');
await run('any systemd unit with OOMPolicy=kill', "systemctl show docker --no-pager 2>/dev/null | grep -iE 'oompolicy|killmode|killsignal'");
await run('check oomd config', 'cat /etc/systemd/oomd.conf 2>/dev/null; echo ---; cat /etc/systemd/oomd.conf.d/*.conf 2>/dev/null');
await run('cgroup ManagedOOMSwap on user/system slices', "find /sys/fs/cgroup -maxdepth 3 -name 'memory.oom.group' 2>/dev/null | head -10");
await run('user.slice & system.slice oom defaults', "systemd-analyze cat-config systemd/oomd.conf 2>/dev/null | tail -20");

// Look for any kill events on the build container's scope name
await run('search journal for blissful_bardeen / b213f73ebc40', "journalctl --since '2026-05-18 11:55' --until '2026-05-18 12:05' --no-pager 2>/dev/null | grep -iE 'b213f73|blissful_bardeen|killed' | tail -30");

// The smoking gun: check journal for ANY 'killed' message in the build window
await run('all "killed" messages in build window', "journalctl --since '2026-05-18 11:55' --until '2026-05-18 12:05' --no-pager 2>/dev/null | grep -iE 'killed' | tail -30");

ssh.dispose();
