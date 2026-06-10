#!/usr/bin/env node
// Run a local .sql file against the PRODUCTION database (read or write — be careful).
// Usage: node scripts/run-prod-sql.js <path-to-sql-file>
// Uses SSH creds from .deploy.secrets.json, executes inside plannivo_db_1 with
// ON_ERROR_STOP=1 so any failure aborts (DO-block scripts roll back atomically).
import { NodeSSH } from 'node-ssh';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/run-prod-sql.js <file.sql>');
  process.exit(1);
}
readFileSync(sqlPath); // fail fast if unreadable

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const secrets = JSON.parse(readFileSync(path.join(__dirname, '..', '.deploy.secrets.json'), 'utf8'));

const remoteTmp = `/tmp/run-prod-${Date.now()}.sql`;
const ssh = new NodeSSH();
try {
  await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password });
  await ssh.putFile(sqlPath, remoteTmp);
  const cp = await ssh.execCommand(`docker cp ${remoteTmp} plannivo_db_1:${remoteTmp}`);
  if (cp.code !== 0) throw new Error('docker cp failed: ' + cp.stderr);

  const res = await ssh.execCommand(
    `docker exec plannivo_db_1 psql -U plannivo -d plannivo -v ON_ERROR_STOP=1 -f ${remoteTmp}`
  );
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);

  await ssh.execCommand(`docker exec plannivo_db_1 rm -f ${remoteTmp}; rm -f ${remoteTmp}`);
  process.exitCode = res.code === 0 ? 0 : 1;
} finally {
  ssh.dispose();
}
