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

const sql = `SELECT document_type, version, length(content) AS content_len, updated_at FROM legal_documents WHERE is_active = true ORDER BY document_type;`;
await run('legal_documents rows on prod', `docker exec plannivo_db_1 psql -U plannivo -d plannivo -t -c "${sql}"`);

ssh.dispose();
