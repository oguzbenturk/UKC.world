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

// Upload the new Dockerfile
console.log('Uploading new Dockerfile.production...');
await ssh.putFile('backend/Dockerfile.production', `${secrets.path}/backend/Dockerfile.production`);

// Test build with the new Dockerfile via BuildKit
await run('build backend with new Dockerfile (BuildKit)', `cd ${secrets.path} && DOCKER_BUILDKIT=1 docker build --progress=plain -t plannivo_backend:test-newdockerfile -f backend/Dockerfile.production backend/ 2>&1 | tail -60`, { options: { execTimeout: 1500000 } });

ssh.dispose();
