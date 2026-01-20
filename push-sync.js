#!/usr/bin/env node
// push-sync.js
// Purpose: Lightweight git push + remote pull helper without rebuilding or restarting services.
// Usage: npm run push:sync -- "Commit title" "Optional description"

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
/* eslint-disable no-console */
import { fileURLToPath } from 'url';
import { NodeSSH } from 'node-ssh';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cwd = process.cwd();

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd, ...opts });
}

function trySh(cmd, opts = {}) {
  try { sh(cmd, opts); } catch (err) { console.warn(`⚠️  ${cmd} failed: ${err.message}`); }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, title: '', desc: '', branch: '' };
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    else if (a === '--title' && args[i + 1]) { out.title = args[++i]; }
    else if (a === '--desc' && args[i + 1]) { out.desc = args[++i]; }
    else if (a === '--branch' && args[i + 1]) { out.branch = args[++i]; }
    else if (!a.startsWith('-')) { positionals.push(a); }
  }
  if (!out.title && positionals.length > 0) out.title = positionals[0];
  if (!out.desc && positionals.length > 1) out.desc = positionals.slice(1).join(' ');
  return out;
}

function parseSimpleEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const out = {};
    raw.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) {
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
          value = value.slice(1, -1);
        }
        out[match[1]] = value;
      }
    });
    return out;
  } catch {
    return {};
  }
}

function getHostFromBackendEnvs() {
  const backendEnv = path.join(cwd, 'backend', '.env');
  const backendEnvServer = path.join(cwd, 'backend', '.env.server');
  const envs = [parseSimpleEnv(backendEnv), parseSimpleEnv(backendEnvServer)];
  for (const env of envs) {
    if (env.REDIS_HOST) return env.REDIS_HOST;
    if (env.DATABASE_URL) {
      const atIdx = env.DATABASE_URL.indexOf('@');
      if (atIdx !== -1) {
        const afterAt = env.DATABASE_URL.slice(atIdx + 1);
        const host = afterAt.split(/[:/]/)[0];
        if (host) return host;
      }
    }
  }
  return undefined;
}

function getPathFromWorkflow() {
  try {
    const workflow = path.join(cwd, '.github', 'workflows', 'deploy.yml');
    if (!fs.existsSync(workflow)) return undefined;
    const raw = fs.readFileSync(workflow, 'utf-8');
    const match = raw.match(/\bcd\s+([^\r\n]+)/);
    if (match && match[1]) {
      const p = match[1].trim();
      if (p.startsWith('/')) return p;
    }
  } catch {}
  return undefined;
}

function loadSecrets(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
  } catch (err) {
    console.warn(`⚠️  Failed to parse ${filePath}: ${err.message}`);
    return {};
  }
}

function determineBranch(explicitBranch) {
  if (explicitBranch) return explicitBranch;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();
  } catch {
    return 'plannivo';
  }
}

function buildCommitMessages(title, desc) {
  return {
    commitTitle: title || `Sync: ${nowStamp()}`,
    commitBody: desc || 'Fast sync via push-sync.js (no services restarted).',
  };
}

function stageAndCommit({ dryRun, commitTitle, commitBody }) {
  console.log('🔁 Step 1/3: Staging & committing local changes...');
  if (dryRun) {
    console.log(`[dry-run] Would run: git add -A && git commit -m "${commitTitle}"`);
    return;
  }

  trySh('git add -A');
  let hasChanges = false;
  try {
    execSync('git diff --cached --quiet', { cwd });
  } catch {
    hasChanges = true;
  }

  if (hasChanges) {
    sh(`git commit -m ${JSON.stringify(commitTitle)} -m ${JSON.stringify(commitBody)}`);
  } else {
    console.log('ℹ️  No staged changes detected; skipping commit.');
  }
}

function pushBranch({ dryRun, branch }) {
  console.log('🚀 Step 2/3: Pushing branch to origin...');
  if (dryRun) {
    console.log(`[dry-run] Would push origin ${branch}`);
    return;
  }
  sh(`git push origin ${branch}`);
}

function collectRemoteConfig({ dryRun, currentBranch, secrets }) {
  if (process.env.DEPLOY === 'false') {
    console.log('DEPLOY=false set. Skipping remote pull.');
    return null;
  }

  const fallbackHost = getHostFromBackendEnvs();
  const fallbackPath = getPathFromWorkflow();

  return {
    dryRun,
    host: process.env.DEPLOY_HOST || secrets.host || fallbackHost,
    username: process.env.DEPLOY_USER || secrets.user || 'root',
    password: process.env.DEPLOY_PASSWORD || secrets.password,
    privateKeyPath: process.env.DEPLOY_KEY_PATH || secrets.keyPath,
    remotePath: process.env.DEPLOY_PATH || secrets.path || fallbackPath || '/root/plannivo',
    remoteBranch: process.env.DEPLOY_BRANCH || secrets.branch || currentBranch || 'plannivo',
    postPullCmd: process.env.SYNC_POST_PULL_CMD || secrets.postPullCmd,
  };
}

async function runRemoteSync(options) {
  const {
    dryRun,
    host,
    username,
    password,
    privateKeyPath,
    remotePath,
    remoteBranch,
    postPullCmd,
  } = options;

  if (!host || !username || (!password && !privateKeyPath)) {
    console.warn('⚠️  Missing remote host/user credentials. Skipping remote pull.');
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would connect to ${username}@${host} and pull branch ${remoteBranch} in ${remotePath}`);
    return;
  }

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host,
      username,
      password: password || undefined,
      privateKey: privateKeyPath ? fs.readFileSync(privateKeyPath, 'utf-8') : undefined,
      readyTimeout: 20000,
    });

    const script = `set -e
cd ${remotePath}
git fetch --all
git checkout ${remoteBranch}
if ! git pull --ff-only origin ${remoteBranch}; then
  echo "Fast-forward pull failed. Falling back to plain pull..."
  git pull origin ${remoteBranch}
fi
${postPullCmd || 'true'}
git status -sb`;

    console.log('🔄 Running remote pull script...');
    const res = await ssh.execCommand(script, { cwd: remotePath });
    if (res.stderr) {
      console.warn('Remote STDERR:', res.stderr);
    }
    console.log(res.stdout);
    console.log('✅ Remote repository updated (no services restarted).');
  } catch (err) {
    console.error('❌ Remote pull failed:', err.message);
    process.exitCode = 1;
  } finally {
    ssh.dispose();
  }
}

async function main() {
  const { dryRun, title, desc, branch } = parseArgs();

  const secrets = loadSecrets(path.join(cwd, '.deploy.secrets.json'));
  const currentBranch = determineBranch(branch);
  const { commitTitle, commitBody } = buildCommitMessages(title, desc);

  stageAndCommit({ dryRun, commitTitle, commitBody });
  pushBranch({ dryRun, branch: currentBranch });

  console.log('🌐 Step 3/3: Pull latest changes on remote host...');
  const remoteConfig = collectRemoteConfig({ dryRun, currentBranch, secrets });
  if (!remoteConfig) return;

  await runRemoteSync(remoteConfig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
