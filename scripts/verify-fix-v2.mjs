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

// 1. Clean test: copy just package*.json into a tmpdir, npm install fresh, with apparmor=unconfined
await run('clean npm install with apparmor=unconfined', `
  TMPDIR=\$(mktemp -d)
  cp ${secrets.path}/package*.json "\$TMPDIR/"
  echo "tmpdir: \$TMPDIR"
  docker run --rm --security-opt apparmor=unconfined -v "\$TMPDIR:/app" -w /app node:20-alpine sh -c "timeout 240 npm install --omit=dev --no-audit --no-fund --ignore-scripts --maxsockets=4 2>&1 | tail -15; echo --- final exit=\\\$?"
  echo "tmpdir contents:"; ls "\$TMPDIR/" | head
  rm -rf "\$TMPDIR"
`, { options: { execTimeout: 600000 } });

// 2. Legacy builder (DOCKER_BUILDKIT=0) with --security-opt
await run('legacy docker build (no BuildKit) with --security-opt apparmor=unconfined', `cd ${secrets.path} && DOCKER_BUILDKIT=0 docker build --security-opt apparmor=unconfined -t plannivo_backend:test-aa -f backend/Dockerfile.production backend/ 2>&1 | tail -30`, { options: { execTimeout: 1500000 } });

ssh.dispose();
