import { NodeSSH } from 'node-ssh';
import { readFileSync, mkdirSync } from 'fs';
const secrets = JSON.parse(readFileSync('D:/UKC.world/.deploy.secrets.json','utf8'));
const out = 'C:/Users/Oguz/AppData/Local/Temp/claude/D--UKC-world/9e1d248d-05ff-4787-9a18-29c47103f017/scratchpad/formfiles';
mkdirSync(out, { recursive: true });
const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });
const r = await ssh.execCommand("ls /var/lib/docker/volumes/plannivo_uploads_data/_data/form-submissions/");
const files = r.stdout.trim().split(/\r?\n/).filter(Boolean);
console.log('files:', files.length);
for (const f of files) {
  await ssh.execCommand(`cp /var/lib/docker/volumes/plannivo_uploads_data/_data/form-submissions/${f} /tmp/dl_${f}`);
  await ssh.getFile(`${out}/${f}`, `/tmp/dl_${f}`);
  await ssh.execCommand(`rm -f /tmp/dl_${f}`);
  console.log('got', f);
}
ssh.dispose();
