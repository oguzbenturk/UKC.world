#!/usr/bin/env node
// push-all.js — Build, commit, push, SSH deploy.
//
// Usage:
//   npm run push-all                 # full deploy (version bump + build + git + SSH)
//   npm run push-all -- --retry      # SSH deploy only (skip version/build/git — for failed deploys)
//   npm run push-all -- --no-version # skip version bump
//   npm run push-all -- --skip-build # skip frontend build (use existing dist/)
//   npm run push-all -- "My message" # custom commit message

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
/* eslint-disable no-console */
import { NodeSSH } from 'node-ssh';

const cwd = process.cwd();

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd, ...opts });
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
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const title = args.filter(a => !a.startsWith('--'))[0] || '';
  return {
    title,
    retry: flags.has('--retry'),
    noVersion: flags.has('--no-version'),
    skipBuild: flags.has('--skip-build'),
  };
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

function bumpVersion(type = 'patch') {
  const versionFilePath = path.join(cwd, 'src', 'shared', 'constants', 'version.js');
  if (!fs.existsSync(versionFilePath)) {
    console.warn('⚠️  Version file not found, skipping version bump');
    return null;
  }
  let content = fs.readFileSync(versionFilePath, 'utf-8');
  const versionMatch = content.match(/export const APP_VERSION = ['"](\d+)\.(\d+)\.(\d+)['"]/);
  if (!versionMatch) {
    console.warn('⚠️  Could not parse version from version.js, skipping version bump');
    return null;
  }
  let major = parseInt(versionMatch[1], 10);
  let minor = parseInt(versionMatch[2], 10);
  let patch = parseInt(versionMatch[3], 10);
  switch (type) {
    case 'major': major++; minor = 0; patch = 0; break;
    case 'minor': minor++; patch = 0; break;
    default: patch++; break;
  }
  const newVersion = `${major}.${minor}.${patch}`;
  content = content.replace(
    /export const APP_VERSION = ['"][^'"]+['"]/,
    `export const APP_VERSION = '${newVersion}'`
  );
  fs.writeFileSync(versionFilePath, content, 'utf-8');
  const indexHtmlPath = path.join(cwd, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    let htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
    htmlContent = htmlContent.replace(
      /<meta name="app-version" content="[^"]*"/,
      `<meta name="app-version" content="${newVersion}"`
    );
    fs.writeFileSync(indexHtmlPath, htmlContent, 'utf-8');
  }
  return newVersion;
}

async function syncN8nWorkflow(secrets) {
  const n8nApiKey = secrets.n8nApiKey;
  const workflowFile = path.join(cwd, 'kai-optimized.json');

  if (!n8nApiKey) {
    console.log('⏭️  No n8nApiKey in .deploy.secrets.json — skipping n8n sync.');
    return;
  }
  if (!fs.existsSync(workflowFile)) {
    console.log('⏭️  kai-optimized.json not found — skipping n8n sync.');
    return;
  }

  console.log('🤖 Step 5/6: Syncing Kai (n8n workflow)...');

  const N8N_BASE = 'https://n8n.plannivo.com/api/v1';
  const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': n8nApiKey };

  // Wait up to 30s for n8n to be ready after container restart
  let n8nReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch(`${N8N_BASE}/workflows?limit=1`, { headers });
      if (r.ok) { n8nReady = true; break; }
    } catch {}
    console.log(`   n8n not ready yet (${i + 1}/10)...`);
    await new Promise(r => setTimeout(r, 3000));
  }
  if (!n8nReady) {
    console.warn('   ⚠️  n8n did not become ready in time — skipping workflow sync.');
    return;
  }

  // Load and strip non-API fields
  const { name, nodes, connections, settings, staticData } = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
  const workflow = { name, nodes, connections, settings, ...(staticData !== undefined && { staticData }) };

  // Find workflow ID
  let workflowId = secrets.n8nWorkflowId;
  if (!workflowId) {
    const listRes = await fetch(`${N8N_BASE}/workflows`, { headers });
    if (listRes.ok) {
      const workflows = (await listRes.json()).data || [];
      const match = workflows.find(w => w.name === workflow.name && w.active);
      if (match) {
        workflowId = match.id;
        secrets.n8nWorkflowId = workflowId;
        fs.writeFileSync(path.join(cwd, '.deploy.secrets.json'), JSON.stringify(secrets, null, 2));
      }
    }
  }

  if (!workflowId) {
    console.warn('   ⚠️  Could not find n8n workflow ID — skipping sync.');
    return;
  }

  // Push updated workflow
  const putRes = await fetch(`${N8N_BASE}/workflows/${workflowId}`, {
    method: 'PUT', headers, body: JSON.stringify(workflow),
  });
  if (!putRes.ok) {
    console.warn(`   ⚠️  Workflow sync failed: ${putRes.status} ${await putRes.text()}`);
    return;
  }
  console.log(`   ✓ Workflow synced: ${workflowId}`);

  // Cycle the workflow to flush any cached state
  await fetch(`${N8N_BASE}/workflows/${workflowId}/deactivate`, { method: 'POST', headers });
  await new Promise(r => setTimeout(r, 2000));
  const activateRes = await fetch(`${N8N_BASE}/workflows/${workflowId}/activate`, { method: 'POST', headers });
  if (activateRes.ok) {
    console.log('   ✓ Kai workflow reactivated — ready.');
  } else {
    console.warn(`   ⚠️  Could not reactivate workflow: ${activateRes.status}`);
  }
}

async function main() {
  const { title, retry, noVersion, skipBuild } = parseArgs();

  // Load secrets
  const secretsPath = path.join(cwd, '.deploy.secrets.json');
  if (!fs.existsSync(secretsPath)) {
    console.error('❌ FATAL: .deploy.secrets.json not found');
    process.exit(1);
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));

  const backendDir = path.join(cwd, 'backend');
  const beEnvProd = path.join(backendDir, '.env.production');
  const beEnv = path.join(backendDir, '.env');
  const beEnvDev = path.join(backendDir, '.env.development');
  const beEnvBackup = path.join(backendDir, '.env.backup');
  const rootEnv = path.join(cwd, '.env');
  const rootEnvProd = path.join(cwd, '.env.production.template');
  const rootEnvBackup = path.join(cwd, '.env.backup');

  const deploy = process.env.DEPLOY !== 'false';

  // ── Pre-flight ───────────────────────────────────────────────────────────────
  console.log('🔍 Pre-flight checks...');
  if (!fs.existsSync(beEnvProd)) {
    console.error('❌ FATAL: backend/.env.production is missing!');
    process.exit(1);
  }
  const prodEnvContent = parseSimpleEnv(beEnvProd);
  if (!prodEnvContent.DATABASE_URL) {
    console.error('❌ FATAL: backend/.env.production is missing DATABASE_URL!');
    process.exit(1);
  }
  if (prodEnvContent.DATABASE_URL.includes(':password@') || prodEnvContent.DATABASE_URL.includes(':changeme@')) {
    console.error('❌ FATAL: backend/.env.production has placeholder password in DATABASE_URL!');
    process.exit(1);
  }
  console.log('   ✓ backend/.env.production validated');

  if (retry) {
    console.log('♻️  --retry mode: skipping version bump, build, and git — going straight to SSH deploy.');
  }

  // ── Step 1: Version bump + frontend build + commit + push ───────────────────
  if (!retry) {
    // Version bump (unless --no-version)
    let commitTitle = title;
    if (!noVersion) {
      console.log('📦 Bumping app version...');
      const newVersion = bumpVersion('patch');
      if (newVersion) {
        console.log(`   ✓ Version bumped to v${newVersion}`);
        if (!commitTitle) commitTitle = `Deploy: v${newVersion} - ${nowStamp()}`;
      } else {
        if (!commitTitle) commitTitle = `Deploy: Production build ${nowStamp()}`;
      }
    } else {
      if (!commitTitle) commitTitle = `Deploy: ${nowStamp()}`;
    }

    // Frontend build
    if (!skipBuild) {
      console.log('🏗️  Building frontend locally...');
      sh('npm run build');
      console.log('   ✓ Frontend built successfully');
    }

    // Swap to prod envs, commit, push, restore
    console.log('🚀 Step 2/6: Committing and pushing to Git...');
    if (fs.existsSync(rootEnv)) fs.copyFileSync(rootEnv, rootEnvBackup);
    if (fs.existsSync(beEnv)) fs.copyFileSync(beEnv, beEnvBackup);
    if (!copyFileSafe(rootEnvProd, rootEnv)) console.warn('⚠️  Root production env not found, skipping root .env swap.');
    if (!copyFileSafe(beEnvProd, beEnv)) console.warn('⚠️  backend/.env.production not found, skipping backend .env swap.');

    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();
    try {
      sh('git add -A');
      const diffExit = execSync('git diff --cached --quiet || echo changed').toString().trim();
      if (diffExit === 'changed') {
        sh(`git commit -m ${JSON.stringify(commitTitle)}`);
      } else {
        console.log('ℹ️  No staged changes to commit.');
      }
      try { sh('git config http.postBuffer 2097152000'); } catch {}
      try { sh('git config http.lowSpeedLimit 0'); } catch {}
      try { sh('git config http.lowSpeedTime 999999'); } catch {}
      sh(`git push origin ${currentBranch}`);
    } finally {
      // Always restore dev envs
      console.log('♻️  Step 3/6: Restoring local development .env files...');
      if (fs.existsSync(rootEnvBackup)) {
        fs.copyFileSync(rootEnvBackup, rootEnv);
        console.log('   ✓ Restored root .env');
      } else {
        console.warn('   ⚠️  No root .env backup found!');
      }
      if (fs.existsSync(beEnvDev)) {
        fs.copyFileSync(beEnvDev, beEnv);
        console.log('   ✓ Restored backend/.env from .env.development');
      } else if (fs.existsSync(beEnvBackup)) {
        fs.copyFileSync(beEnvBackup, beEnv);
        console.log('   ✓ Restored backend/.env from backup');
      } else {
        console.warn('   ⚠️  No backend .env.development or backup found!');
      }
      try { if (fs.existsSync(rootEnvBackup)) fs.rmSync(rootEnvBackup); } catch {}
      try { if (fs.existsSync(beEnvBackup)) fs.rmSync(beEnvBackup); } catch {}
    }
  }

  // ── Step 4: SSH deploy ───────────────────────────────────────────────────────
  console.log('🖥️  Step 4/6: Connecting to remote host to deploy...');
  if (!deploy) {
    console.log('DEPLOY=false set. Skipping remote deployment.');
  } else {
    const host = process.env.DEPLOY_HOST || secrets.host;
    const username = process.env.DEPLOY_USER || secrets.user || 'root';
    const password = process.env.DEPLOY_PASSWORD || secrets.password;
    const privateKeyPath = process.env.DEPLOY_KEY_PATH || secrets.keyPath;
    const remotePath = process.env.DEPLOY_PATH || secrets.path || '/root/plannivo';
    const remoteBranch = process.env.DEPLOY_BRANCH || secrets.branch || 'main';

    if (!host || !username || (!password && !privateKeyPath)) {
      console.warn('⚠️  Missing SSH credentials. Skipping remote deploy.');
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

        if (retry) {
          console.log('♻️  --retry mode: skipping file uploads (using files already on server).');
        } else {
          // Upload backend/.env.production
          console.log('🔑 Uploading backend/.env.production to server...');
          await ssh.putFile(beEnvProd, `${remotePath}/backend/.env.production`);
          console.log('   ✓ backend/.env.production uploaded');

          // Upload pre-built frontend dist
          console.log('📤 Uploading frontend dist to server...');
          const localDistDir = path.join(cwd, 'dist');
          const remoteDistDir = `${remotePath}/dist`;
          await ssh.execCommand(`rm -rf ${remoteDistDir} && mkdir -p ${remoteDistDir}`);
          await ssh.putDirectory(localDistDir, remoteDistDir, {
            recursive: true,
            concurrency: 5,
            validate: () => true,
          });
          console.log('   ✓ Frontend dist uploaded');

          // Upload SSL certificates
          const localSslDir = path.join(cwd, 'SSL');
          const remoteSslDir = `${remotePath}/SSL`;
          const sslFiles = ['certificate.crt', 'private.key', 'ca_bundle.crt'];
          const missingSsl = sslFiles.filter(f => !fs.existsSync(path.join(localSslDir, f)));
          if (missingSsl.length > 0) {
            console.warn(`⚠️  Missing SSL files locally: ${missingSsl.join(', ')} — nginx may fail!`);
          } else {
            console.log('🔐 Uploading SSL certificates to server...');
            await ssh.execCommand(`mkdir -p ${remoteSslDir}`);
            await Promise.all(sslFiles.map(async (file) => {
              await ssh.putFile(path.join(localSslDir, file), `${remoteSslDir}/${file}`);
              console.log(`   ✓ Uploaded ${file}`);
            }));
            await ssh.execCommand(
              `chmod 640 ${remoteSslDir}/private.key && chown root:101 ${remoteSslDir}/private.key` +
              ` && chmod 644 ${remoteSslDir}/certificate.crt ${remoteSslDir}/ca_bundle.crt` +
              ` && cat ${remoteSslDir}/certificate.crt ${remoteSslDir}/ca_bundle.crt > ${remoteSslDir}/fullchain.crt` +
              ` && chmod 644 ${remoteSslDir}/fullchain.crt`
            );
            console.log('   ✓ SSL certificates uploaded + fullchain.crt created');
          }
        }

        const COMPOSE = `docker-compose --project-name plannivo -f docker-compose.production.yml`;

        // Remote deploy script — no set -e so one failure doesn't kill everything
        const script = `
cd ${remotePath}

echo "=== Plannivo Deploy ==="

# 1. Update code
echo "Pulling latest code..."
git fetch --all
git reset --hard origin/${remoteBranch}

# 2. Verify prerequisites
echo "Checking prerequisites..."
MISSING=0
for f in dist/index.html backend/.env.production SSL/fullchain.crt; do
  if [ ! -f "$f" ]; then echo "  ERROR: Missing required file: $f"; MISSING=1; fi
done
if [ "$MISSING" = "1" ]; then echo "Aborting: missing prerequisites."; exit 1; fi
echo "  All prerequisites present."

# 3. Load env vars
set -a
. ./backend/.env.production || true
set +a
export COMPOSE_PROJECT_NAME=plannivo

# 4. Build backend image
echo "Building backend..."
if ! ${COMPOSE} build backend; then
  echo "ERROR: Backend build failed."
  exit 1
fi

# 5. Stop + remove all containers cleanly (avoids compose 1.29 ContainerConfig bug on any service)
echo "Stopping existing containers..."
${COMPOSE} down --remove-orphans 2>/dev/null || true

# 6. Start all services fresh
echo "Starting all services..."
if ! ${COMPOSE} up -d; then
  echo "ERROR: Failed to start services."
  ${COMPOSE} logs --tail=50
  exit 1
fi

# 7. Wait for backend health
echo "Waiting for backend to be healthy..."
HEALTHY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  HEALTH=\$(${COMPOSE} exec -T backend wget -qO- http://localhost:4000/api/health 2>/dev/null || echo fail)
  if [ "\$HEALTH" != "fail" ]; then
    echo "  Backend healthy after \${i}x3s."
    HEALTHY=1
    break
  fi
  echo "  Waiting (\$i/15)..."
  sleep 3
done
if [ "\$HEALTHY" = "0" ]; then
  echo "WARNING: Backend did not become healthy in time — check logs:"
  ${COMPOSE} logs --tail=30 backend
fi

# 8. Run database migrations
echo "Running migrations..."
${COMPOSE} exec -T backend node migrate.js up \
  && echo "  Migrations: OK" \
  || echo "  Migrations: FAILED (non-fatal — check logs)"

# 9. Health check frontend
echo ""
echo "Checking frontend..."
for i in 1 2 3 4 5; do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    echo "  Frontend healthy."
    break
  fi
  echo "  Waiting (\$i/5)..."
  sleep 3
done

# 10. Final status
echo ""
echo "=== Container Status ==="
${COMPOSE} ps
echo ""
echo "=== Deploy Complete ==="
`;

        console.log('🔧 Running remote deploy script...');
        const res = await ssh.execCommand(script, { cwd: remotePath });
        if (res.stderr) console.warn('Remote STDERR:', res.stderr);
        console.log(res.stdout);
        if (res.code !== 0 && res.code != null) {
          console.error(`❌ Remote deploy script exited with code ${res.code}`);
          process.exitCode = 1;
        } else {
          console.log('✅ Remote deployment completed.');
        }
      } catch (err) {
        console.error('❌ Remote deployment failed:', err.message);
        process.exitCode = 1;
      } finally {
        ssh.dispose();
      }
    }
  }

  // ── Step 5: Sync n8n workflow ────────────────────────────────────────────────
  await syncN8nWorkflow(secrets);

  console.log('🏁 Step 6/6: Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
