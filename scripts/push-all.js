#!/usr/bin/env node
// push-all.js — Swap .env to production, commit and push, restore .env to dev, SSH to pull and restart services.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
/* eslint-disable no-console */
import { NodeSSH } from 'node-ssh';

const cwd = process.cwd();

/**
 * Bump the app version (patch by default).
 * Updates src/shared/constants/version.js and index.html meta tag.
 */
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
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  return { title: args[0] || '' };
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

async function main() {
  const { title } = parseArgs();

  // Load secrets
  const secretsPath = path.join(cwd, '.deploy.secrets.json');
  if (!fs.existsSync(secretsPath)) {
    console.error('❌ FATAL: .deploy.secrets.json not found');
    process.exit(1);
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));

  // Paths
  const rootEnv = path.join(cwd, '.env');
  const rootEnvProd = path.join(cwd, '.env.production.template');
  const rootEnvBackup = path.join(cwd, '.env.backup');

  const backendDir = path.join(cwd, 'backend');
  const beEnv = path.join(backendDir, '.env');
  const beEnvProd = path.join(backendDir, '.env.production');
  const beEnvDev = path.join(backendDir, '.env.development');
  const beEnvBackup = path.join(backendDir, '.env.backup');

  const deploy = process.env.DEPLOY !== 'false';

  // 0) Pre-flight
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

  // 1) Swap to production envs
  console.log('📦 Step 1/5: Switching .env files to production...');
  if (fs.existsSync(rootEnv)) fs.copyFileSync(rootEnv, rootEnvBackup);
  if (fs.existsSync(beEnv)) fs.copyFileSync(beEnv, beEnvBackup);

  if (!copyFileSafe(rootEnvProd, rootEnv)) console.warn('⚠️  Root production env not found, skipping root .env swap.');
  if (!copyFileSafe(beEnvProd, beEnv)) console.warn('⚠️  backend/.env.production not found, skipping backend .env swap.');

  // 1.5) Bump version
  console.log('📦 Bumping app version...');
  const newVersion = bumpVersion('patch');
  let commitTitle = title;
  if (newVersion) {
    console.log(`   ✓ Version bumped to v${newVersion}`);
    if (!commitTitle) commitTitle = `Deploy: v${newVersion} - ${nowStamp()}`;
  } else {
    if (!commitTitle) commitTitle = `Deploy: Production build ${nowStamp()}`;
  }

  // 1.6) Build frontend locally if dist/ doesn't exist (avoids OOM on server)
  // User can run `npm run build` manually before push-all to skip this step.
  const distDir = path.join(cwd, 'dist');
  if (fs.existsSync(distDir) && fs.readdirSync(distDir).length > 0) {
    console.log('📦 Using existing dist/ (run `npm run build` manually to rebuild).');
  } else {
    console.log('🏗️  Building frontend locally (no dist/ found)...');
    sh('npm run build');
    console.log('   ✓ Frontend built successfully');
  }

  // 2) Commit & push, then 3) restore envs
  console.log('🚀 Step 2/5: Committing and pushing to Git...');
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim();

  try {
    sh('git add -A');
    const diffExit = execSync('git diff --cached --quiet || echo changed').toString().trim();
    if (diffExit === 'changed') {
      sh(`git commit -m ${JSON.stringify(commitTitle)}`);
    } else {
      console.log('ℹ️  No staged changes to commit.');
    }

    // Raise buffer for large pushes
    try { sh('git config http.postBuffer 2097152000'); } catch {}
    try { sh('git config http.lowSpeedLimit 0'); } catch {}
    try { sh('git config http.lowSpeedTime 999999'); } catch {}

    sh(`git push origin ${currentBranch}`);
  } finally {
    // 3) Always restore local dev envs
    console.log('♻️  Step 3/5: Restoring local development .env files...');

    if (fs.existsSync(rootEnvBackup)) {
      fs.copyFileSync(rootEnvBackup, rootEnv);
      console.log('   ✓ Restored root .env from backup');
    } else {
      console.warn('   ⚠️  No root .env backup found - .env may still be in production mode!');
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

  // 4) SSH deploy
  console.log('🖥️  Step 4/5: Connecting to remote host to deploy...');
  if (!deploy) {
    console.log('DEPLOY=false set. Skipping remote deployment.');
  } else {
    const host = process.env.DEPLOY_HOST || secrets.host;
    const username = process.env.DEPLOY_USER || secrets.user || 'root';
    const password = process.env.DEPLOY_PASSWORD || secrets.password;
    const privateKeyPath = process.env.DEPLOY_KEY_PATH || secrets.keyPath;
    const remotePath = process.env.DEPLOY_PATH || secrets.path || '/root/plannivo';
    const remoteBranch = process.env.DEPLOY_BRANCH || secrets.branch || 'main';

    console.log(`   📌 Remote: git reset --hard origin/${remoteBranch} in ${remotePath}`);

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

        // Upload backend/.env.production (gitignored, must be transferred each deploy)
        console.log('🔑 Uploading backend/.env.production to server...');
        await ssh.putFile(beEnvProd, `${remotePath}/backend/.env.production`);
        console.log('   ✓ backend/.env.production uploaded');

        // Upload pre-built frontend dist directly to repo dir
        // (git reset --hard preserves gitignored/untracked files, so no /tmp staging needed)
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

        // Upload SSL certificates (gitignored, must be transferred each deploy)
        const localSslDir = path.join(cwd, 'SSL');
        const remoteSslDir = `${remotePath}/SSL`;
        const sslFiles = ['certificate.crt', 'private.key', 'ca_bundle.crt'];
        const missingSsl = sslFiles.filter(f => !fs.existsSync(path.join(localSslDir, f)));
        if (missingSsl.length > 0) {
          console.warn(`⚠️  Missing SSL files locally: ${missingSsl.join(', ')} — nginx may fail to start!`);
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

        const script = `set -e
cd ${remotePath}

echo "=== Plannivo Deploy ==="

# 1. Update code (git reset --hard preserves gitignored: dist/, SSL/, backend/.env.production)
echo "Pulling latest code..."
git fetch --all
git reset --hard origin/${remoteBranch}

# 2. Verify prerequisites
echo "Checking prerequisites..."
for f in dist/index.html backend/.env.production SSL/fullchain.crt; do
  if [ ! -f "$f" ]; then echo "ERROR: Missing required file: $f"; exit 1; fi
done
echo "  All prerequisites present."

# 3. Load env vars for compose interpolation (REDIS_PASSWORD, POSTGRES_PASSWORD, etc.)
set -a
. ./backend/.env.production || true
set +a
export COMPOSE_PROJECT_NAME=plannivo

# 4. Build backend image (only service that needs building)
echo "Building backend..."
docker-compose --project-name plannivo -f docker-compose.production.yml build backend

# 5. Start all services (compose handles recreate/restart automatically)
echo "Starting all services..."
docker-compose --project-name plannivo -f docker-compose.production.yml up -d

# 6. Wait for backend health
echo "Waiting for backend..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker-compose --project-name plannivo -f docker-compose.production.yml exec -T backend \\
    node -e "require('http').get('http://localhost:4000/api/health',(r)=>{process.exit(r.statusCode===200?0:1)})" 2>/dev/null; then
    echo "  Backend healthy."
    break
  fi
  echo "  Waiting ($i/10)..."
  sleep 3
done

# 7. Run database migrations
echo "Running migrations..."
docker-compose --project-name plannivo -f docker-compose.production.yml exec -T backend node migrate.js up \\
  && echo "  Migrations: OK" \\
  || echo "  Migrations: FAILED (check logs above)"

# 8. Health checks
echo ""
echo "Checking frontend..."
for i in 1 2 3 4 5; do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    echo "  Frontend healthy."
    break
  fi
  echo "  Waiting ($i/5)..."
  sleep 3
done

# 9. Final status
echo ""
echo "=== Container Status ==="
docker-compose --project-name plannivo -f docker-compose.production.yml ps
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

  console.log('🏁 Step 5/5: Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
