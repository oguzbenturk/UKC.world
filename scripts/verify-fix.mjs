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

// Revert the test Dockerfile in case the previous test polluted it
console.log('Re-uploading current Dockerfile.production...');
await ssh.putFile('backend/Dockerfile.production', `${secrets.path}/backend/Dockerfile.production`);

// Run the exact same build command we just wired into push-all
await run('build backend with apparmor=unconfined (BuildKit)', `cd ${secrets.path} && DOCKER_BUILDKIT=1 docker build --security-opt apparmor=unconfined -t plannivo_backend:latest -f backend/Dockerfile.production backend/ 2>&1 | tail -40`, { options: { execTimeout: 1500000 } });

await run('verify image exists', "docker images plannivo_backend --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}' | head -3");

ssh.dispose();
