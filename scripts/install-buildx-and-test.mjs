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

await run('apt-get update', 'apt-get update -qq 2>&1 | tail -5', { options: { execTimeout: 120000 } });

// Try the upstream Docker apt repo first (where buildx lives). If that's not configured, fall back to docker.io's buildx via plain apt.
await run('apt-cache search docker-buildx', 'apt-cache search docker-buildx 2>&1 | head -5');
await run('install docker-buildx-plugin', 'DEBIAN_FRONTEND=noninteractive apt-get install -y docker-buildx-plugin 2>&1 | tail -10', { options: { execTimeout: 300000 } });

await run('docker buildx version', 'docker buildx version 2>&1');
await run('docker buildx ls', 'docker buildx ls 2>&1');

// Test BuildKit by building the backend image
await run('test build with BuildKit', `cd ${secrets.path} && DOCKER_BUILDKIT=1 docker build -t plannivo_backend_buildkit_test -f backend/Dockerfile.production backend/ 2>&1 | tail -40`, { options: { execTimeout: 900000 } });

ssh.dispose();
