#!/usr/bin/env node
// push-all.js
// Purpose: Swap .env to production, commit and push with a helpful message, restore .env to dev, then SSH into host to pull and restart services.
// NOTE: Do NOT hardcode secrets. Provide them via environment variables.

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
  // eslint-disable-next-line no-unused-vars
  try { sh(cmd, opts); } catch (_ignored) { /* ignore in fallback paths */ }
}

function copyFileSafe(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
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
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    else if (a === '--title' && args[i + 1]) { out.title = args[++i]; }
    else if (a === '--desc' && args[i + 1]) { out.desc = args[++i]; }
    else if (a === '--branch' && args[i + 1]) { out.branch = args[++i]; }
    else if (!a.startsWith('-')) { positionals.push(a); }
  }
  // Allow first bare arg as title, second as desc
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
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        let v = m[2];
        // strip quotes
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        out[m[1]] = v;
      }
    });
    return out;
  } catch {
    return {};
  }
}

function getHostFromBackendEnvs() {
  const beEnv = path.join(cwd, 'backend', '.env');
  const beEnvServer = path.join(cwd, 'backend', '.env.server');
  const envs = [parseSimpleEnv(beEnv), parseSimpleEnv(beEnvServer)];

  for (const e of envs) {
    // Prefer REDIS_HOST
    if (e.REDIS_HOST) return e.REDIS_HOST;
    if (e.DATABASE_URL) {
      // DATABASE_URL=postgresql://user:pass@host:5432/db
      const atIdx = e.DATABASE_URL.indexOf('@');
      if (atIdx !== -1) {
        const afterAt = e.DATABASE_URL.slice(atIdx + 1);
        const host = afterAt.split(/[:/]/)[0];
        if (host) return host;
      }
    }
  }
  return undefined;
}

function getPathFromWorkflow() {
  try {
    const wf = path.join(cwd, '.github', 'workflows', 'deploy.yml');
    if (!fs.existsSync(wf)) return undefined;
    const raw = fs.readFileSync(wf, 'utf-8');
    const m = raw.match(/\bcd\s+([^\r\n]+)/);
    if (m && m[1]) {
      const p = m[1].trim();
      if (p.startsWith('/')) return p;
    }
  } catch {}
  return undefined;
}

// eslint-disable-next-line complexity
async function main() {
  const { dryRun, title, desc, branch } = parseArgs();

  // Load optional local secrets (ignored by git)
  const secretsPath = path.join(cwd, '.deploy.secrets.json');
  let secrets = {};
  try {
    if (fs.existsSync(secretsPath)) {
      secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) || {};
    }
  } catch {}

  // Compute paths
  const rootEnv = path.join(cwd, '.env');
  const rootEnvProd = path.join(cwd, '.env.production.template');
  const rootEnvDev = path.join(cwd, '.env'); // Current state before swap
  const rootEnvBackup = path.join(cwd, '.env.backup');

  const backendDir = path.join(cwd, 'backend');
  const beEnv = path.join(backendDir, '.env');
  const beEnvProd = path.join(backendDir, '.env.production');
  const beEnvDev = path.join(backendDir, '.env.development');
  const beEnvBackup = path.join(backendDir, '.env.backup');

  const commitTitle = title || `Deploy: Production build ${nowStamp()}`;
  const commitBody = desc || 'Automated deploy via push-all.js. Switched env to production for deployment, then restored to development locally.';

  const deploy = process.env.DEPLOY !== 'false';

  // 1) Swap to production envs (with backup)
  console.log('📦 Step 1/5: Backing up and switching .env files to production...');
  if (fs.existsSync(rootEnv)) fs.copyFileSync(rootEnv, rootEnvBackup);
  if (fs.existsSync(beEnv)) fs.copyFileSync(beEnv, beEnvBackup);

  const rootEnvSwapped = copyFileSafe(rootEnvProd, rootEnv);
  const beEnvSwapped = copyFileSafe(beEnvProd, beEnv);
  if (!rootEnvSwapped) console.warn('⚠️  Root production env not found (.env.production.template). Skipping root .env swap.');
  if (!beEnvSwapped) console.warn('⚠️  Backend production env not found (backend/.env.production). Skipping backend .env swap.');

  // 2) Commit & push
  console.log('🚀 Step 2/5: Committing and pushing to Git...');
  // Get current branch if not specified
  let currentBranch = branch;
  if (!currentBranch) {
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();
    } catch {
      currentBranch = 'plannivo';
    }
  }

  // Stage all relevant changes (respect .gitignore)
  if (!dryRun) {
    trySh('git add -A');
    // Only commit if there are staged changes
    const diffExit = execSync('git diff --cached --quiet || echo changed').toString().trim();
    if (diffExit === 'changed') {
      sh(`git commit -m ${JSON.stringify(commitTitle)} -m ${JSON.stringify(commitBody)}`);
    } else {
      console.log('ℹ️  No staged changes to commit.');
    }

    // Push
    if (process.env.GITHUB_TOKEN) {
      // Attempt push with existing remote; rely on credential manager/token if configured
      // Token is not printed or stored.
      sh(`git push origin ${currentBranch}`);
    } else {
      // Try a normal push first (will prompt if needed). Users should have credentials configured.
      sh(`git push origin ${currentBranch}`);
    }
  } else {
    console.log(`[dry-run] Would commit with title: ${commitTitle}`);
    console.log(`[dry-run] Would push branch: ${currentBranch}`);
  }

  // 3) Restore local dev envs
  console.log('♻️  Step 3/5: Restoring local development .env files...');
  
  // Restore root .env - prefer backup, but don't delete it yet
  if (fs.existsSync(rootEnvBackup)) {
    fs.copyFileSync(rootEnvBackup, rootEnv);
    console.log('   ✓ Restored root .env from backup');
  } else {
    console.warn('   ⚠️  No root .env backup found - .env may still be in production mode!');
  }
  
  // Restore backend .env - prefer .env.development, fallback to backup
  if (fs.existsSync(beEnvDev)) {
    fs.copyFileSync(beEnvDev, beEnv);
    console.log('   ✓ Restored backend/.env from .env.development');
  } else if (fs.existsSync(beEnvBackup)) {
    fs.copyFileSync(beEnvBackup, beEnv);
    console.log('   ✓ Restored backend/.env from backup');
  } else {
    console.warn('   ⚠️  No backend .env.development or backup found - backend/.env may still be in production mode!');
  }
  
  // Clean up backups AFTER successful restoration
  try { 
    if (fs.existsSync(rootEnvBackup)) {
      fs.rmSync(rootEnvBackup);
      console.log('   ✓ Cleaned up root .env backup');
    }
  } catch (err) {
    console.warn('   ⚠️  Could not remove root .env backup:', err.message);
  }
  try { 
    if (fs.existsSync(beEnvBackup)) {
      fs.rmSync(beEnvBackup);
      console.log('   ✓ Cleaned up backend .env backup');
    }
  } catch (err) {
    console.warn('   ⚠️  Could not remove backend .env backup:', err.message);
  }

  // 4) SSH into host and deploy
  console.log('🖥️  Step 4/5: Connecting to remote host to deploy...');
  if (!deploy) {
    console.log('DEPLOY=false set. Skipping remote deployment.');
  } else {
  const fallbackHost = getHostFromBackendEnvs();
  const fallbackPath = getPathFromWorkflow();
  const host = process.env.DEPLOY_HOST || secrets.host || fallbackHost; // e.g., 217.154.201.29
  const username = process.env.DEPLOY_USER || secrets.user || 'root'; // default root
  const password = process.env.DEPLOY_PASSWORD || secrets.password; // or use DEPLOY_KEY_PATH
  const privateKeyPath = process.env.DEPLOY_KEY_PATH || secrets.keyPath; // e.g., C:\\Users\\me\\.ssh\\id_rsa
  const remotePath = process.env.DEPLOY_PATH || secrets.path || fallbackPath || '/root/plannivo';
  const remoteBranch = process.env.DEPLOY_BRANCH || secrets.branch || 'plannivo';
  const preBuildCmd = process.env.DEPLOY_PRE_BUILD_CMD || '';
  const postBuildCmd = process.env.DEPLOY_POST_BUILD_CMD || '';

    if (!host || !username || (!password && !privateKeyPath)) {
      console.warn('⚠️  Missing DEPLOY_HOST/DEPLOY_USER and DEPLOY_PASSWORD or DEPLOY_KEY_PATH. Skipping remote deploy.');
    } else if (dryRun) {
      console.log(`[dry-run] Would SSH to ${username}@${host} and run deployment in ${remotePath}`);
    } else {
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
# Clean any uncommitted changes and untracked files
git clean -fd
git checkout .
git fetch --all
git reset --hard origin/${remoteBranch}
${preBuildCmd || 'true'}
# Ensure ACME/ZeroSSL validation files are synced to the host webroot
if [ -d public/.well-known ]; then
  echo "Syncing .well-known contents to /root/acme-webroot..."
  mkdir -p /root/acme-webroot/.well-known
  cp -R public/.well-known/. /root/acme-webroot/.well-known/
fi
# Free up port 80/443 if something else is using them (host nginx or another container)
echo "Checking for existing services on ports 80 and 443..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop nginx 2>/dev/null || true
fi
if command -v service >/dev/null 2>&1; then
  service nginx stop 2>/dev/null || true
fi
# Stop any docker containers publishing host port :80 or :443
DOCKER_80_CONTAINERS=$(docker ps --format '{{.ID}} {{.Ports}}' | awk '/:80->/ {print $1}')
DOCKER_443_CONTAINERS=$(docker ps --format '{{.ID}} {{.Ports}}' | awk '/:443->/ {print $1}')
if [ -n "$DOCKER_80_CONTAINERS$DOCKER_443_CONTAINERS" ]; then
  echo "Stopping containers publishing :80/:443: $DOCKER_80_CONTAINERS $DOCKER_443_CONTAINERS"
  docker rm -f $DOCKER_80_CONTAINERS $DOCKER_443_CONTAINERS 2>/dev/null || true
fi
echo "Port usage after cleanup (80/443):"
ss -tulpn 2>/dev/null | grep -E ':(80|443) ' || true
if [ -f docker-compose.production.yml ]; then
  # Build images first
  echo "Building Docker images..."
  docker build -t plannivo_backend -f backend/Dockerfile.production backend/
  docker build -t plannivo_frontend -f Dockerfile .

  # Stop and remove old containers (ignore errors if they don't exist)
  echo "Stopping old containers..."
  docker stop frontend backend 2>/dev/null || true
  docker rm frontend backend 2>/dev/null || true
  
  # Ensure network exists
  docker network create plannivo_app-network 2>/dev/null || true
  
  # Start db and redis if not running
  echo "Ensuring db and redis are running..."
  docker start 04f6f53837f7_plannivo_db_1 e9fee54aad2f_plannivo_redis_1 2>/dev/null || true
  sleep 3
  
  # Start backend with proper name for nginx resolution
  echo "Starting backend..."
  docker run -d --name backend \\
    --network plannivo_app-network \\
    --env-file ${remotePath}/backend/.env.production \\
    -v plannivo_uploads_data:/app/uploads \\
    --restart unless-stopped \\
    plannivo_backend
  
  # Wait for backend to be healthy
  echo "Waiting for backend..."
  sleep 5
  
  # Start frontend with proper name and SSL mounts
  echo "Starting frontend..."
  docker run -d --name frontend \\
    --network plannivo_app-network \\
    -p 80:80 -p 443:443 \\
    -v /root/acme-webroot:/var/www/acme:ro \\
    -v ${remotePath}/SSL:/etc/ssl/plannivo:ro \\
    -v plannivo_uploads_data:/var/www/uploads:ro \\
    --restart unless-stopped \\
    plannivo_frontend
  
  # Show status
  docker ps
  echo "Checking backend health..."
  for i in 1 2 3 4 5; do
    if docker exec frontend curl -fsS http://backend:4000/api/health >/dev/null 2>&1; then
      echo "Backend Health: OK"; break; fi; echo "waiting backend ($i)..."; sleep 4; done
  if ! docker exec frontend curl -fsS http://backend:4000/api/health >/dev/null 2>&1; then
    echo "Backend Health: FAIL"; docker logs backend --tail=200 || true; fi
  echo "Checking frontend health..."
  for i in 1 2 3 4 5; do
    if curl -fsS http://localhost:80/ >/dev/null 2>&1; then
      echo "Frontend Health: OK"; break; fi; echo "waiting frontend ($i)..."; sleep 4; done
  if ! curl -fsS http://localhost:80/ >/dev/null 2>&1; then
    echo "Frontend Health: FAIL"; docker logs frontend --tail=200 || true; fi
else
  # Node-based build and restart
  if command -v nvm >/dev/null 2>&1; then
    . "$HOME/.nvm/nvm.sh" && nvm use 18 || true
  fi
  npm ci
  npm run build:production || npm run build || true
  cd backend && npm ci && cd ..
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart plannivo-backend || pm2 start backend/server.js --name plannivo-backend
  else
    pkill -f "node .*backend/server.js" || true
    nohup node backend/server.js > backend/production.log 2>&1 & disown || true
  fi
  sleep 3
  (curl -fsS http://localhost:4000/api/health && echo "Health: OK") || {
    echo "Health: FAIL";
    tail -n 200 backend/production.log || true;
  }
fi
${postBuildCmd || 'true'}`;

        console.log('🔧 Running remote deploy script...');
        const res = await ssh.execCommand(script, { cwd: remotePath });
        if (res.stderr) {
          console.warn('Remote STDERR:', res.stderr);
        }
        console.log(res.stdout);
        console.log('✅ Remote deployment completed.');
      } catch (err) {
        console.error('❌ Remote deployment failed:', err.message);
        process.exitCode = 1;
      } finally {
        ssh.dispose();
      }
    }
  }

  console.log('🏁 Step 5/5: Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
