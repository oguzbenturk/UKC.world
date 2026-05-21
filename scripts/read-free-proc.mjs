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

await run('the script content', 'cat /usr/local/bin/free_proc.sh 2>&1');
await run('script perms + creation date', 'ls -la /usr/local/bin/free_proc.sh 2>&1; stat /usr/local/bin/free_proc.sh 2>&1 | head -10');
await run('git history of any related repo nearby', 'find /usr/local/bin /opt /root -name "free_proc*" -o -name "observed*" 2>/dev/null | head -10');

ssh.dispose();
