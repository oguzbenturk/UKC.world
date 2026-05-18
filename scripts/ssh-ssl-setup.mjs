#!/usr/bin/env node
// Helper for ZeroSSL HTTP file-validation setup.
// Usage:
//   node scripts/ssh-ssl-setup.mjs inspect
//   node scripts/ssh-ssl-setup.mjs deploy <localValidationFile>

import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const TOKEN_FILENAME = '6BA651621922CB34EA1521D24DEF1DA2.txt';
const REMOTE_LANDING = `${secrets.path}/plannivo-landing`;
const REMOTE_VALIDATION_DIR = `${REMOTE_LANDING}/.well-known/pki-validation`;
const REMOTE_NGINX_CONF = `${secrets.path}/infrastructure/nginx.conf`;

const cmd = process.argv[2] || 'inspect';
const arg = process.argv[3];

const ssh = new NodeSSH();
await ssh.connect({
  host: secrets.host,
  username: secrets.user,
  password: secrets.password,
  readyTimeout: 30000,
});

async function run(label, command) {
  console.log(`\n--- ${label} ---`);
  const r = await ssh.execCommand(command);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('[stderr]', r.stderr);
  return r;
}

if (cmd === 'inspect') {
  await run('host nginx sites-enabled', 'ls /etc/nginx/sites-enabled/ 2>/dev/null');
  await run('host nginx conf.d', 'ls /etc/nginx/conf.d/ 2>/dev/null');
  await run('host nginx for plannivo.com', "grep -rEl 'plannivo.com|server_name' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ /etc/nginx/sites-available/ 2>/dev/null");
  await run('host nginx plannivo cat', "for f in $(grep -rEl 'plannivo' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ /etc/nginx/sites-available/ 2>/dev/null); do echo '=====' $f; cat $f; done");
  await run('docker ps', "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'");
  await run('plannivo-landing on server', `ls -la ${REMOTE_LANDING} 2>/dev/null`);
  await run('existing validation dir?', `ls -la ${REMOTE_VALIDATION_DIR} 2>/dev/null || echo 'NOT FOUND'`);
  await run('cert expiry on server', 'openssl x509 -in /root/plannivo/SSL/fullchain.crt -noout -subject -dates 2>/dev/null || echo "no fullchain"');
  await run('curl HTTP from outside (loopback)', `curl -sI -H 'Host: plannivo.com' http://127.0.0.1/.well-known/pki-validation/${TOKEN_FILENAME} | head -10`);
} else if (cmd === 'putfile') {
  if (!arg || !fs.existsSync(arg)) {
    console.error('Pass the local validation file path');
    process.exit(1);
  }
  await run('mkdir validation dir', `mkdir -p ${REMOTE_VALIDATION_DIR}`);
  console.log(`\nUploading ${arg} -> ${REMOTE_VALIDATION_DIR}/${TOKEN_FILENAME}`);
  await ssh.putFile(arg, `${REMOTE_VALIDATION_DIR}/${TOKEN_FILENAME}`);
  await run('verify file on server', `cat ${REMOTE_VALIDATION_DIR}/${TOKEN_FILENAME} && echo --- && ls -la ${REMOTE_VALIDATION_DIR}/`);
} else if (cmd === 'putnginx') {
  if (!arg || !fs.existsSync(arg)) {
    console.error('Pass the local nginx.conf path');
    process.exit(1);
  }
  console.log(`\nUploading ${arg} -> ${REMOTE_NGINX_CONF}`);
  await ssh.putFile(arg, REMOTE_NGINX_CONF);
  await run('reload frontend nginx container', `cd ${secrets.path} && docker exec plannivo_frontend_1 nginx -t && docker exec plannivo_frontend_1 nginx -s reload`);
} else if (cmd === 'reload') {
  await run('container name', "docker ps --format '{{.Names}}' | grep frontend");
  await run('reload nginx', "docker ps --format '{{.Names}}' | grep frontend | xargs -I{} docker exec {} sh -c 'nginx -t && nginx -s reload'");
} else if (cmd === 'verify') {
  await run('curl via loopback HTTP', `curl -si -H 'Host: plannivo.com' http://127.0.0.1/.well-known/pki-validation/${TOKEN_FILENAME}`);
  await run('curl via loopback www HTTP', `curl -si -H 'Host: www.plannivo.com' http://127.0.0.1/.well-known/pki-validation/${TOKEN_FILENAME}`);
  await run('curl external HTTP', `curl -sIL http://plannivo.com/.well-known/pki-validation/${TOKEN_FILENAME} | head -20`);
} else if (cmd === 'shell') {
  await run('shell', arg);
} else {
  console.error('Unknown command:', cmd);
  process.exit(1);
}

ssh.dispose();
