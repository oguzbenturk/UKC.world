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
  return r;
}

await run('test host nginx config', 'nginx -t');
await run('reload host nginx (preserves running master, no downtime)', 'systemctl reload nginx && echo reloaded');
await run('verify external HTTPS plannivo.com (new cert?)', `echo | openssl s_client -servername plannivo.com -connect plannivo.com:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates`);
await run('verify external HTTPS www.plannivo.com', `echo | openssl s_client -servername www.plannivo.com -connect www.plannivo.com:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates`);
await run('verify HTTPS returns 200', `curl -sI https://plannivo.com/ | head -3; echo ---; curl -sI https://www.plannivo.com/ | head -3`);

ssh.dispose();
