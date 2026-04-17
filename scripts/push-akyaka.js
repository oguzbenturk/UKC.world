#!/usr/bin/env node
// push-akyaka.js — Build, commit, push, SSH deploy for akyaka.plannivo.com.
//
// Deploys the Akyaka stack (isolated containers, isolated Postgres, own subdomain)
// to the shared VPS. Never touches Plannivo's containers, volumes, or env files.
//
// Usage:
//   npm run push-akyaka                 # full deploy (version bump + build + git + SSH)
//   npm run push-akyaka -- --retry      # SSH deploy only (skip version/build/git)
//   npm run push-akyaka -- --no-version # skip version bump
//   npm run push-akyaka -- --skip-build # skip frontend build (reuse existing dist/)
//   npm run push-akyaka -- "My message" # custom commit message

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
  // Akyaka maintains its own version file separate from Plannivo's.
  const versionFilePath = path.join(cwd, 'src', 'shared', 'constants', 'version.akyaka.js');
  if (!fs.existsSync(versionFilePath)) {
    console.warn('⚠️  Akyaka version file not found, skipping version bump');
    return null;
  }
  let content = fs.readFileSync(versionFilePath, 'utf-8');
  const versionMatch = content.match(/export const APP_VERSION = ['"](\d+)\.(\d+)\.(\d+)['"]/);
  if (!versionMatch) {
    console.warn('⚠️  Could not parse version from version.akyaka.js, skipping version bump');
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
  // NOTE: index.html meta update intentionally skipped — Akyaka shares Plannivo's
  // dist/index.html for the demo phase and we don't want Akyaka version noise in
  // Plannivo's HTML. When Akyaka branding diverges, revisit this.
  return newVersion;
}

// NOTE: syncN8nWorkflow is intentionally absent — Akyaka's demo stack does not
// include n8n. If Akyaka ever needs its own Kai instance, add a dedicated n8n
// service to docker-compose.akyaka.yml on a non-conflicting port (e.g. 5679).

async function main() {
  const { title, retry, noVersion, skipBuild } = parseArgs();

  // Load Akyaka-specific secrets. Strictly separate from Plannivo's.
  const secretsPath = path.join(cwd, '.deploy.secrets.akyaka.json');
  if (!fs.existsSync(secretsPath)) {
    console.error('❌ FATAL: .deploy.secrets.akyaka.json not found');
    console.error('   Copy .deploy.secrets.akyaka.json.example and fill in your values.');
    process.exit(1);
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));

  const backendDir = path.join(cwd, 'backend');
  const beEnvProd = path.join(backendDir, '.env.akyaka.production');
  const beEnvPlannivoProd = path.join(backendDir, '.env.production');
  const beEnv = path.join(backendDir, '.env');
  const beEnvDev = path.join(backendDir, '.env.development');
  const beEnvBackup = path.join(backendDir, '.env.backup');
  const rootEnv = path.join(cwd, '.env');
  const rootEnvProd = path.join(cwd, '.env.production.template');
  const rootEnvBackup = path.join(cwd, '.env.backup');

  const deploy = process.env.DEPLOY !== 'false';

  // ── Pre-flight ───────────────────────────────────────────────────────────────
  console.log('🔍 Pre-flight checks (Akyaka)...');
  if (!fs.existsSync(beEnvProd)) {
    console.error('❌ FATAL: backend/.env.akyaka.production is missing!');
    console.error('   Copy backend/.env.akyaka.production.example and fill in your values.');
    process.exit(1);
  }
  const prodEnvContent = parseSimpleEnv(beEnvProd);
  if (!prodEnvContent.DATABASE_URL) {
    console.error('❌ FATAL: backend/.env.akyaka.production is missing DATABASE_URL!');
    process.exit(1);
  }
  if (prodEnvContent.DATABASE_URL.includes(':password@') || prodEnvContent.DATABASE_URL.includes(':changeme@')) {
    console.error('❌ FATAL: backend/.env.akyaka.production has placeholder password in DATABASE_URL!');
    process.exit(1);
  }
  // Safety cross-check: refuse to deploy if Akyaka env reuses Plannivo's DB or JWT.
  // Catches the copy-paste footgun that would point Akyaka's backend at Plannivo's data.
  if (fs.existsSync(beEnvPlannivoProd)) {
    const plannivoEnvContent = parseSimpleEnv(beEnvPlannivoProd);
    if (plannivoEnvContent.DATABASE_URL && plannivoEnvContent.DATABASE_URL === prodEnvContent.DATABASE_URL) {
      console.error('❌ FATAL: Akyaka DATABASE_URL matches Plannivo\'s exactly. Refusing to deploy.');
      process.exit(1);
    }
    if (plannivoEnvContent.JWT_SECRET && plannivoEnvContent.JWT_SECRET === prodEnvContent.JWT_SECRET) {
      console.error('❌ FATAL: Akyaka JWT_SECRET matches Plannivo\'s. Generate a distinct secret.');
      process.exit(1);
    }
  }
  console.log('   ✓ backend/.env.akyaka.production validated');
  console.log('   ✓ Akyaka DB/JWT secrets confirmed distinct from Plannivo');

  if (retry) {
    console.log('♻️  --retry mode: skipping version bump, build, and git — going straight to SSH deploy.');
  }

  // ── Step 1: Version bump + frontend build + commit + push ───────────────────
  if (!retry) {
    // Version bump (unless --no-version)
    let commitTitle = title;
    if (!noVersion) {
      console.log('📦 Bumping Akyaka app version...');
      const newVersion = bumpVersion('patch');
      if (newVersion) {
        console.log(`   ✓ Akyaka version bumped to v${newVersion}`);
        if (!commitTitle) commitTitle = `Deploy (Akyaka): v${newVersion} - ${nowStamp()}`;
      } else {
        if (!commitTitle) commitTitle = `Deploy (Akyaka): Production build ${nowStamp()}`;
      }
    } else {
      if (!commitTitle) commitTitle = `Deploy (Akyaka): ${nowStamp()}`;
    }

    // Frontend build
    if (!skipBuild) {
      console.log('🏗️  Building frontend locally...');
      sh('npm run build');
      console.log('   ✓ Frontend built successfully');
    }

    // Swap to prod envs for the git commit window, then restore dev envs.
    // Mirrors push-all's pattern; these paths are gitignored so nothing sensitive is committed.
    console.log('🚀 Step 2/5: Committing and pushing to Git...');
    if (fs.existsSync(rootEnv)) fs.copyFileSync(rootEnv, rootEnvBackup);
    if (fs.existsSync(beEnv)) fs.copyFileSync(beEnv, beEnvBackup);
    if (!copyFileSafe(rootEnvProd, rootEnv)) console.warn('⚠️  Root production env not found, skipping root .env swap.');
    if (!copyFileSafe(beEnvProd, beEnv)) console.warn('⚠️  backend/.env.akyaka.production not found, skipping backend .env swap.');

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
      console.log('♻️  Step 3/5: Restoring local development .env files...');
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
  console.log('🖥️  Step 4/5: Connecting to remote host to deploy Akyaka...');
  if (!deploy) {
    console.log('DEPLOY=false set. Skipping remote deployment.');
  } else {
    const host = process.env.DEPLOY_HOST || secrets.host;
    const username = process.env.DEPLOY_USER || secrets.user || 'root';
    const password = process.env.DEPLOY_PASSWORD || secrets.password;
    const privateKeyPath = process.env.DEPLOY_KEY_PATH || secrets.keyPath;
    const remotePath = process.env.DEPLOY_PATH || secrets.path || '/root/plannivo-akyaka';
    const remoteBranch = process.env.DEPLOY_BRANCH || secrets.branch || 'Akyaka';

    // Safety: refuse to deploy into Plannivo's directory.
    if (remotePath === '/root/plannivo') {
      console.error('❌ FATAL: Akyaka remotePath is set to /root/plannivo (Plannivo\'s directory).');
      console.error('   Akyaka must deploy to its own directory (default /root/plannivo-akyaka).');
      process.exit(1);
    }

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
          // Upload Akyaka backend env to a temp path (git reset --hard would wipe the real path)
          console.log('🔑 Uploading backend/.env.akyaka.production to server...');
          await ssh.putFile(beEnvProd, `${remotePath}/.env.akyaka.production.deploy`);
          console.log('   ✓ backend/.env.akyaka.production uploaded');

          // Upload pre-built frontend dist (same build as Plannivo for demo phase)
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

          // Upload Akyaka SSL certificates (from local SSL-akyaka/)
          const localSslDir = path.join(cwd, 'SSL-akyaka');
          const remoteSslDir = `${remotePath}/SSL-akyaka`;
          const sslFiles = ['certificate.crt', 'private.key', 'ca_bundle.crt'];
          const missingSsl = sslFiles.filter(f => !fs.existsSync(path.join(localSslDir, f)));
          if (missingSsl.length > 0) {
            console.warn(`⚠️  Missing SSL files locally in SSL-akyaka/: ${missingSsl.join(', ')} — Akyaka nginx may fail!`);
          } else {
            console.log('🔐 Uploading Akyaka SSL certificates to server...');
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
            console.log('   ✓ Akyaka SSL certificates uploaded + fullchain.crt created');
          }
        }

        // Project-name scope keeps every docker-compose command confined to Akyaka —
        // Plannivo containers and volumes are invisible to this session.
        const COMPOSE = `docker-compose --project-name akyaka -f docker-compose.akyaka.yml`;

        // Remote deploy script for Akyaka. Every docker-compose call is scoped to
        // --project-name akyaka, so Plannivo containers/volumes cannot be touched.
        const script = `
cd ${remotePath}

echo "=== Akyaka Deploy ==="

# 1. Update code on Akyaka branch
echo "Pulling latest code (branch: ${remoteBranch})..."
git fetch --all
git reset --hard origin/${remoteBranch}

# Restore uploaded env file (git reset --hard wipes it if gitignored)
if [ -f .env.akyaka.production.deploy ]; then
  mkdir -p backend
  cp .env.akyaka.production.deploy backend/.env.akyaka.production
  rm -f .env.akyaka.production.deploy
  echo "  ✓ backend/.env.akyaka.production restored from upload"
fi

# 2. Verify prerequisites
echo "Checking prerequisites..."
MISSING=0
for f in dist/index.html backend/.env.akyaka.production SSL-akyaka/fullchain.crt SSL-akyaka/private.key docker-compose.akyaka.yml infrastructure/nginx.akyaka.conf; do
  if [ ! -f "$f" ]; then echo "  ERROR: Missing required file: $f"; MISSING=1; fi
done
if [ "$MISSING" = "1" ]; then echo "Aborting: missing prerequisites."; exit 1; fi
echo "  All prerequisites present."

# 3. Load Akyaka env vars for compose interpolation (POSTGRES_*, REDIS_PASSWORD)
set -a
. ./backend/.env.akyaka.production || true
set +a
export COMPOSE_PROJECT_NAME=akyaka

# 4. Build Akyaka backend image
echo "Building Akyaka backend..."
if ! ${COMPOSE} build backend; then
  echo "ERROR: Akyaka backend build failed."
  exit 1
fi

# 5. Stop + remove Akyaka containers cleanly.
# --project-name akyaka means Plannivo containers are NOT touched.
echo "Stopping existing Akyaka containers..."
${COMPOSE} down --remove-orphans 2>/dev/null || true

# 6. Start Akyaka services fresh
echo "Starting Akyaka services..."
if ! ${COMPOSE} up -d; then
  echo "ERROR: Failed to start Akyaka services."
  ${COMPOSE} logs --tail=50
  exit 1
fi

# 7. Wait for backend health
echo "Waiting for Akyaka backend to be healthy..."
HEALTHY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  HEALTH=\$(${COMPOSE} exec -T backend wget -qO- http://localhost:4000/api/health 2>/dev/null || echo fail)
  if [ "\$HEALTH" != "fail" ]; then
    echo "  Akyaka backend healthy after \${i}x3s."
    HEALTHY=1
    break
  fi
  echo "  Waiting (\$i/15)..."
  sleep 3
done
if [ "\$HEALTHY" = "0" ]; then
  echo "ERROR: Akyaka backend did not become healthy — cannot run migrations."
  ${COMPOSE} logs --tail=50 backend
  exit 1
fi

# 8. Run database migrations. On a fresh DB this MUST succeed — hard-exit on failure.
echo "Running migrations against Akyaka DB..."
if ! ${COMPOSE} exec -T backend node migrate.js up; then
  echo "ERROR: Akyaka migrations failed. Aborting."
  exit 1
fi
echo "  Migrations: OK"

# 8b. First-run bootstrap gate — THE SAFETY INVARIANT OF THIS SCRIPT.
# Runs schema-only-reset.mjs (seeds roles + admin) ONLY on first deploy. The sentinel
# is created after success so subsequent deploys do NOT wipe Akyaka's data.
if [ ! -f .akyaka-bootstrapped ]; then
  echo "First-run bootstrap: seeding roles + admin user for Akyaka..."
  if ! ${COMPOSE} exec -T \\
      -e SCHEMA_RESET_ADMIN_EMAIL=sergenerenler@plannivo.com \\
      -e SCHEMA_RESET_ADMIN_PASSWORD=sergenerenler \\
      backend node scripts/schema-only-reset.mjs --execute; then
    echo "ERROR: First-run bootstrap failed. Fix and rerun push-akyaka."
    exit 1
  fi
  touch .akyaka-bootstrapped
  echo "  ✓ Akyaka bootstrapped with admin sergenerenler@plannivo.com"
else
  echo "Bootstrap sentinel present — skipping schema-only-reset (data preserved)."
fi

# 9. Health check Akyaka frontend on its dedicated host port (8081)
echo ""
echo "Checking Akyaka frontend..."
for i in 1 2 3 4 5; do
  if curl -fsS http://localhost:8081/health >/dev/null 2>&1; then
    echo "  Akyaka frontend healthy."
    break
  fi
  echo "  Waiting (\$i/5)..."
  sleep 3
done

# 10. Final status
echo ""
echo "=== Akyaka Container Status ==="
${COMPOSE} ps
echo ""
echo "=== Akyaka Deploy Complete ==="
`;

        console.log('🔧 Running remote Akyaka deploy script...');
        const res = await ssh.execCommand(script, { cwd: remotePath });
        if (res.stderr) console.warn('Remote STDERR:', res.stderr);
        console.log(res.stdout);
        if (res.code !== 0 && res.code != null) {
          console.error(`❌ Remote Akyaka deploy script exited with code ${res.code}`);
          process.exitCode = 1;
        } else {
          console.log('✅ Remote Akyaka deployment completed.');
        }
      } catch (err) {
        console.error('❌ Remote Akyaka deployment failed:', err.message);
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
