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

await run('systemctl status observed', 'systemctl status observed --no-pager 2>&1 | head -25');
await run('what binary does observed run', 'systemctl show observed --no-pager 2>&1 | grep -iE "ExecStart|FragmentPath|description|RootDirectory" | head -10');
await run('observed unit file', 'find /etc/systemd /usr/lib/systemd /run/systemd -name "observed.service" 2>/dev/null | head -5 | xargs -r cat');
await run('observed binary version/info', 'which observed; observed --version 2>&1 | head -5; observed --help 2>&1 | head -30');
await run('observed process tree + open files', 'ps auxf | grep -A2 -B2 observed | head -20; echo ---; lsof -p $(pgrep observed) 2>/dev/null | head -10');
await run('observed listening ports', 'ss -lntp 2>/dev/null | grep observed; ss -ltnp 2>/dev/null | head -5');
await run('dpkg owner of observed binary', 'dpkg -S $(which observed 2>/dev/null) 2>&1 | head -5; ls -la $(which observed 2>/dev/null) 2>&1');
await run('recent observed logs', 'journalctl -u observed --since "30 minutes ago" --no-pager 2>&1 | tail -30');

// Try the killer test: stop observed, run docker build, see if it succeeds
await run('STOP observed temporarily', 'systemctl stop observed && echo "stopped" && sleep 2 && systemctl is-active observed');

await run('try docker npm install with observed STOPPED', `
  TMPDIR=\$(mktemp -d)
  cp ${secrets.path}/package*.json "\$TMPDIR/"
  docker run --rm -v "\$TMPDIR:/app" -w /app node:20-alpine sh -c "timeout 240 npm install --omit=dev --no-audit --no-fund --ignore-scripts --maxsockets=4 2>&1 | tail -10; echo --- exit=\\\$?"
  echo "node_modules created?"; ls "\$TMPDIR/" 2>&1 | head
  rm -rf "\$TMPDIR"
`, { options: { execTimeout: 600000 } });

await run('RESTART observed', 'systemctl start observed && systemctl is-active observed');

ssh.dispose();
