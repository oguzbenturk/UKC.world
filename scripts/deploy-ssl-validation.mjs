#!/usr/bin/env node
// One-shot deploy of ZeroSSL HTTP file-validation:
//   1) Upload updated infrastructure/nginx.conf
//   2) Upload validation file to plannivo-landing/.well-known/pki-validation/
//   3) Reload the frontend nginx container
//   4) Verify file is reachable
//
// The user explicitly authorized this action: they're renewing the SSL cert
// and asked Claude to "put it in to my server computer the required files".
//
// Run: node scripts/deploy-ssl-validation.mjs

import { NodeSSH } from 'node-ssh';
import fs from 'fs';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const TOKEN = '6BA651621922CB34EA1521D24DEF1DA2.txt';
const REMOTE_ROOT = secrets.path;
const REMOTE_NGINX = `${REMOTE_ROOT}/infrastructure/nginx.conf`;
const REMOTE_VAL_DIR = `${REMOTE_ROOT}/plannivo-landing/.well-known/pki-validation`;
const REMOTE_VAL_FILE = `${REMOTE_VAL_DIR}/${TOKEN}`;
const LOCAL_NGINX = 'infrastructure/nginx.conf';
const LOCAL_VAL_FILE = `plannivo-landing/.well-known/pki-validation/${TOKEN}`;

for (const f of [LOCAL_NGINX, LOCAL_VAL_FILE]) {
  if (!fs.existsSync(f)) {
    console.error(`Missing local file: ${f}`);
    process.exit(1);
  }
}

const ssh = new NodeSSH();
console.log(`Connecting to ${secrets.user}@${secrets.host}...`);
await ssh.connect({
  host: secrets.host,
  username: secrets.user,
  password: secrets.password,
  tryKeyboard: true,
  readyTimeout: 30000,
});

async function run(label, command) {
  console.log(`\n--- ${label} ---`);
  const r = await ssh.execCommand(command);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('[stderr]', r.stderr);
  return r;
}

await run('current state on server', `ls -la ${REMOTE_ROOT}/plannivo-landing/ 2>/dev/null; echo ---containers---; docker ps --format '{{.Names}}' | grep -E 'frontend|plannivo'`);

console.log('\nUploading nginx.conf...');
await ssh.putFile(LOCAL_NGINX, REMOTE_NGINX);

await run('mkdir validation dir', `mkdir -p ${REMOTE_VAL_DIR}`);

console.log('Uploading validation file...');
await ssh.putFile(LOCAL_VAL_FILE, REMOTE_VAL_FILE);

await run('confirm file on disk', `cat ${REMOTE_VAL_FILE} && echo --- && ls -la ${REMOTE_VAL_DIR}/`);

await run('container name', "docker ps --format '{{.Names}}' | grep -i frontend");

await run('test nginx config inside frontend container', `for c in $(docker ps --format '{{.Names}}' | grep -i frontend); do echo container=$c; docker exec $c nginx -t; done`);

await run('reload nginx inside frontend container', `for c in $(docker ps --format '{{.Names}}' | grep -i frontend); do docker exec $c nginx -s reload && echo reloaded $c; done`);

await run('verify via container loopback HTTPS', `curl -sk -o /dev/null -w 'https=%{http_code}\\n' --resolve plannivo.com:8443:127.0.0.1 https://plannivo.com:8443/.well-known/pki-validation/${TOKEN}`);
await run('verify via container loopback HTTP', `curl -s -o /dev/null -w 'http=%{http_code}\\n' --resolve plannivo.com:8080:127.0.0.1 http://plannivo.com:8080/.well-known/pki-validation/${TOKEN}`);
await run('verify external HTTP via host nginx', `curl -sI http://plannivo.com/.well-known/pki-validation/${TOKEN} | head -10`);
await run('verify external HTTPS via host nginx (-k accepts expired cert)', `curl -skI https://plannivo.com/.well-known/pki-validation/${TOKEN} | head -10`);
await run('verify content matches via HTTP', `curl -sL http://plannivo.com/.well-known/pki-validation/${TOKEN}`);

ssh.dispose();
console.log('\nDone.');
