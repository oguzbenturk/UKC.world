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

// 1. Run npm install ON THE HOST (not docker) and see if it gets killed too
await run('npm install ON HOST (not docker) in tmpdir', `
  TMPDIR=\$(mktemp -d)
  cp ${secrets.path}/package*.json "\$TMPDIR/"
  cd "\$TMPDIR"
  echo "host node: $(node --version), npm: $(npm --version)"
  echo "running npm install on host..."
  timeout 240 npm install --omit=dev --no-audit --no-fund --ignore-scripts --maxsockets=4 2>&1 | tail -15
  echo "--- final exit=\$?"
  ls "\$TMPDIR" | head
  rm -rf "\$TMPDIR"
`, { options: { execTimeout: 600000 } });

// 2. Look for unusual processes / security agents
await run('all systemd services (active)', "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -50");
await run('non-standard agents', "ps aux | grep -iE 'agent|monitor|guard|sentinel|wazuh|falco|crowdstrike|carbonblack|bitdefender|kaspersky|panopta|deepsec|symantec|sentinelone|ossec' | grep -v grep | head -10");
await run('IONOS / cloud agent?', "ls /opt /usr/local 2>/dev/null | head -30; echo ---; dpkg -l 2>/dev/null | grep -iE 'agent|monitor|sentinel|wazuh|falco|crowdstrike|carbonblack|deepsec|symantec|sentinelone|ossec|ionos' | head -10");

// 3. Check if there are any processes that match the pattern of recently spawned & killed
await run('audit log: any process killed events', "ausearch --start recent -m USER_END,USER_LOGIN,USER_LOGOUT,ANOM_ABEND,USER_AUTH 2>/dev/null | head -20; echo ---; aulast 2>&1 | head -5");

// 4. Check for cron-driven killers
await run('cron jobs', "ls -la /etc/cron.d/ /etc/cron.hourly/ /etc/cron.daily/ 2>/dev/null | head -40");
await run('cron content', "find /etc/cron* -type f -exec grep -l 'kill\\|pkill\\|killall' {} \\; 2>/dev/null | head -10");

// 5. Live monitoring: launch a brief npm install and observe what it does in /proc
await run('strace npm install briefly', `
  if ! command -v strace >/dev/null 2>&1; then
    echo "strace not installed on host. Trying via apt..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y strace 2>&1 | tail -3
  fi
  docker run --rm --cap-add=SYS_PTRACE -v ${secrets.path}:/app:ro -w /tmp node:20-alpine sh -c "
    apk add --no-cache strace 2>/dev/null >/dev/null
    cp /app/package*.json /tmp/
    strace -f -e signal,kill -o /tmp/strace.log npm install --omit=dev --no-audit --no-fund --ignore-scripts --maxsockets=2 2>&1 | tail -3
    echo '--- last 30 lines of strace log ---'
    tail -30 /tmp/strace.log
  " 2>&1 | tail -50
`, { options: { execTimeout: 600000 } });

ssh.dispose();
