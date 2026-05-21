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
}

// 1. List configured OCI runtime hooks
await run('OCI hook directories', 'ls -la /usr/share/containers/oci/hooks.d/ /etc/containers/oci/hooks.d/ 2>/dev/null');
await run('hook files', 'cat /usr/share/containers/oci/hooks.d/*.json 2>/dev/null; cat /etc/containers/oci/hooks.d/*.json 2>/dev/null');

// 2. nvidia-container-runtime config
await run('nvidia-container-runtime config', 'cat /etc/nvidia-container-runtime/config.toml 2>/dev/null | head -30; ls /usr/bin/nvidia-* 2>/dev/null');
await run('Is GPU available?', 'lspci 2>/dev/null | grep -i nvidia | head -3; nvidia-smi 2>&1 | head -3');

// 3. Containerd hook config
await run('containerd config', 'containerd config dump 2>/dev/null | grep -iE "hook|prestart|stream" | head -20');

// 4. Default runtime in daemon
await run('docker runtimes', 'docker info 2>/dev/null | grep -iE "runtime"');

// 5. Build with NO daemon prestart hooks — use buildx or try without any extras
await run('install buildx?', 'docker buildx version 2>&1 | head -3');

// 6. Try a known-good build runtime test
await run('plain run with verbose runtime info', 'docker run --rm --runtime=runc node:20-alpine echo "container started" 2>&1 | head -10');

// 7. Direct test: 5 sequential docker runs to see flakiness
await run('5 sequential docker runs (test consistency)', `for i in 1 2 3 4 5; do echo "=== run $i ==="; docker run --rm node:20-alpine node -e 'console.log(process.version)' 2>&1 | tail -2; done`, { options: { execTimeout: 120000 } });

// 8. Is /tmp full? prestart hooks may write there
await run('disk on /tmp /var/lib/docker', 'df -h /tmp /var/lib/docker / 2>/dev/null');

ssh.dispose();
