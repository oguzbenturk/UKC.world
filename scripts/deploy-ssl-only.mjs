#!/usr/bin/env node
// Cert-only refresh: upload SSL/ files, rebuild fullchain.crt server-side,
// reload the frontend nginx container. No git, no build, no version bump.
//
// Run: node scripts/deploy-ssl-only.mjs

import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const REMOTE_SSL = `${secrets.path}/SSL`;
const FILES = ['certificate.crt', 'private.key', 'ca_bundle.crt'];

for (const f of FILES) {
  const p = path.join('SSL', f);
  if (!fs.existsSync(p)) {
    console.error(`Missing local file: ${p}`);
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

await run('current cert on server (before)', `openssl x509 -in ${REMOTE_SSL}/fullchain.crt -noout -subject -dates 2>&1 | head -5`);

console.log('\nUploading SSL files...');
for (const f of FILES) {
  await ssh.putFile(path.join('SSL', f), `${REMOTE_SSL}/${f}`);
  console.log(`   uploaded ${f}`);
}

await run('rebuild fullchain.crt + fix perms', `chmod 640 ${REMOTE_SSL}/private.key && chown root:101 ${REMOTE_SSL}/private.key && chmod 644 ${REMOTE_SSL}/certificate.crt ${REMOTE_SSL}/ca_bundle.crt && cat ${REMOTE_SSL}/certificate.crt ${REMOTE_SSL}/ca_bundle.crt > ${REMOTE_SSL}/fullchain.crt && chmod 644 ${REMOTE_SSL}/fullchain.crt && ls -la ${REMOTE_SSL}/`);

await run('verify new cert on server', `openssl x509 -in ${REMOTE_SSL}/fullchain.crt -noout -subject -issuer -dates`);

await run('verify key matches cert', `CM=$(openssl x509 -in ${REMOTE_SSL}/certificate.crt -noout -modulus | openssl md5); KM=$(openssl rsa -in ${REMOTE_SSL}/private.key -noout -modulus 2>/dev/null | openssl md5); echo "cert=$CM"; echo "key= $KM"; [ "$CM" = "$KM" ] && echo MATCH || echo MISMATCH`);

await run('reload nginx in frontend containers', `for c in $(docker ps --format '{{.Names}}' | grep -i frontend); do echo "=== $c ==="; docker exec $c nginx -t && docker exec $c nginx -s reload && echo "reloaded $c"; done`);

await run('verify external HTTPS now serves new cert', `echo | openssl s_client -servername plannivo.com -connect plannivo.com:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates`);
await run('verify external HTTPS www', `echo | openssl s_client -servername www.plannivo.com -connect www.plannivo.com:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates`);
await run('verify external HTTPS ukc subdomain', `echo | openssl s_client -servername ukc.plannivo.com -connect ukc.plannivo.com:443 2>/dev/null | openssl x509 -noout -subject -dates`);

ssh.dispose();
console.log('\nDone.');
