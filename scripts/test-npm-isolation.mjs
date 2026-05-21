import { NodeSSH } from 'node-ssh';
import fs from 'fs';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, tryKeyboard: true, readyTimeout: 30000 });

async function run(label, cmd, opts = {}) {
  console.log(`\n--- ${label} ---`);
  const r = await ssh.execCommand(cmd, opts);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('[stderr]', r.stderr);
  return r;
}

// 1. Can a docker container allocate 1GB of RAM? If killed → hard cgroup limit
await run('1GB allocation test inside fresh container', `docker run --rm node:20-alpine sh -c "node -e 'const a = Buffer.alloc(1024*1024*1024); console.log(\\"alloc OK\\", a.length); setTimeout(()=>console.log(\\"survived\\"), 1500)'" 2>&1 | tail -20`, { options: { execTimeout: 60000 } });

// 2. Just node startup — does even node survive?
await run('node startup test', `docker run --rm node:20-alpine node -e 'console.log("node alive", process.version)' 2>&1 | tail -5`, { options: { execTimeout: 30000 } });

// 3. Try the build with explicit memory args + swap
await run('docker build with --memory=4g --memory-swap=8g', `cd ${secrets.path} && docker build --memory=4g --memory-swap=8g -t plannivo_backend_test -f backend/Dockerfile.production backend/ 2>&1 | tail -25`, { options: { execTimeout: 600000 } });

// 4. npm ci on the host directly (NOT in docker)
await run('npm ci on host (NOT in docker)', `cd ${secrets.path} && rm -rf node_modules_test && cp -r node_modules node_modules_bak 2>/dev/null; cd ${secrets.path} && /usr/bin/timeout 120 npm ci --omit=dev --no-audit --no-fund --prefer-offline 2>&1 | tail -20`, { options: { execTimeout: 180000 } });

ssh.dispose();
