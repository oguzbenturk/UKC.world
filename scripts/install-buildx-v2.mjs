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

await run('install docker-buildx', 'DEBIAN_FRONTEND=noninteractive apt-get install -y docker-buildx 2>&1 | tail -10', { options: { execTimeout: 300000 } });
await run('docker buildx version', 'docker buildx version 2>&1');
await run('docker buildx ls', 'docker buildx ls 2>&1');

// Test BuildKit by building the backend image — full output for diagnostics
await run('test build with BuildKit (verbose)', `cd ${secrets.path} && DOCKER_BUILDKIT=1 docker build -t plannivo_backend_buildkit_test -f backend/Dockerfile.production backend/ 2>&1 | tail -50`, { options: { execTimeout: 900000 } });

ssh.dispose();
