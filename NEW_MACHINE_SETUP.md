# New Machine Setup — UKC Mobile Dev Environment

Paste this file into Claude Code on your new machine and say:
**"Read this file and set up my dev environment exactly as described."**

---

## Project Overview

You are working on the **UKC World mobile app** — a React Native (Expo) app for a kite school
built on the Plannivo platform.

**GitHub repo:** `https://github.com/oguzbenturk/UKC.world`
**Branch:** `mobile` (all mobile work lives here — never touch `main`)

**Two parts of this project:**
- `ukc-mobile/` → The React Native/Expo mobile app (your active work)
- `UKC.world/` → The existing Node.js/Express backend + web app (READ ONLY reference)

---

## Step 1 — Clone the Repo

```
git clone https://github.com/oguzbenturk/UKC.world.git UKC.Mobile
cd UKC.Mobile
git checkout mobile
```

Work directory going forward: `ukc-mobile/` inside the cloned folder.

---

## Step 2 — Install Prerequisites

Make sure these are installed:
- **Node.js** v18+ (https://nodejs.org)
- **Chocolatey** (Windows package manager — https://chocolatey.org/install)
- **Expo Go** app on your iPhone (for testing)

---

## Step 3 — Set Up PostgreSQL (for the backend)

The project uses embedded PostgreSQL binaries. Run these commands:

### 3a. Install backend dependencies (this downloads the pg binaries):
```
cd UKC.world/backend
npm install
```

### 3b. Create a Windows service account for PostgreSQL:
```
powershell -Command "New-LocalUser -Name 'postgres_svc' -Password (ConvertTo-SecureString 'Pg@ukc2024!' -AsPlainText -Force) -PasswordNeverExpires -UserMayNotChangePassword -Description 'PostgreSQL Service Account'"
```

### 3c. Initialize the database cluster:
Run this Node.js script (save as `init-db.mjs` in `UKC.world/backend/` and run with `node init-db.mjs`):

```js
import EmbeddedPostgres from 'embedded-postgres';
const pg = new EmbeddedPostgres({
  databaseDir: 'C:/ProgramData/ukcpostgres/data',
  user: 'ukcworld',
  password: 'ukcworld',
  port: 5432,
  persistent: true,
});
await pg.initialise();
console.log('Initialized. Now start PostgreSQL with start-postgres.ps1');
process.exit(0);
```

### 3d. Create the startup script `start-postgres.ps1` in your workspace root:

```powershell
$pgbin = 'PATH_TO\UKC.Mobile\UKC.world\backend\node_modules\@embedded-postgres\windows-x64\native\bin'
$pgexe = Join-Path $pgbin 'postgres.exe'
$pgdata = 'C:\ProgramData\ukcpostgres\data'

$conn = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
if ($conn) { Write-Host "PostgreSQL already running"; exit 0 }

$pass = ConvertTo-SecureString 'Pg@ukc2024!' -AsPlainText -Force
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $pgexe
$psi.Arguments = "-D $pgdata -p 5432"
$psi.WorkingDirectory = $pgbin
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.UserName = 'postgres_svc'
$psi.Password = $pass
$psi.Domain = $env:COMPUTERNAME

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null
Write-Host "PostgreSQL started (PID: $($proc.Id))"
Start-Sleep 4
Write-Host "Ready on port 5432"
```

> Replace `PATH_TO` with the actual path to your workspace.

### 3e. Grant postgres_svc permissions on the data directory:
```
icacls C:\ProgramData\ukcpostgres /grant "postgres_svc:(OI)(CI)F" /T
```

### 3f. Start PostgreSQL and create the database:
```
powershell -File start-postgres.ps1
```

Then run this to create the database:
```
cd UKC.world/backend
node --input-type=module -e "
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 5432, user: 'ukcworld', password: 'ukcworld', database: 'postgres' });
await c.connect();
await c.query('CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"');
await c.query('CREATE DATABASE ukcworld OWNER ukcworld');
await c.end();
console.log('Database created!');
"
```

---

## Step 4 — Backend .env File

Create `UKC.world/backend/.env` with this content:

```
LOCAL_DATABASE_URL=postgresql://ukcworld:ukcworld@localhost:5432/ukcworld
RUN_DB_MIGRATIONS=true
NODE_ENV=development
BACKEND_API_PORT=4000
BACKEND_API_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=local-dev-secret-change-in-production
TOKEN_EXPIRY=7d
AUTH_COOKIE_NAME=ukc_token
MAX_FAILED_LOGINS=10
ACCOUNT_LOCK_DURATION=15
BACKUPS_ENABLED=false
RECONCILIATION_ENABLED=false
DISABLE_REDIS=true
```

---

## Step 5 — Apply Base Database Schema

The `ksprodb.sql` file in `UKC.world/` is the full database schema. Apply it:

```
cd UKC.world/backend
node apply-schema.mjs
```

> The `apply-schema.mjs` file should be in `UKC.world/backend/`. If missing, ask Claude to recreate it — it reads `ksprodb.sql` and applies all table definitions to the local database.

After applying the schema, mark all migrations as already applied:
```
cd UKC.world/backend
node --input-type=module -e "
import pg from 'pg'; import fs from 'fs'; import crypto from 'crypto'; import path from 'path';
const c = new pg.Client({ host:'127.0.0.1', port:5432, user:'ukcworld', password:'ukcworld', database:'ukcworld' });
await c.connect();
const dir = './db/migrations';
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir,f),'utf8');
  const cs = crypto.createHash('sha256').update(sql).digest('hex');
  await c.query('INSERT INTO schema_migrations(filename,checksum,migration_name) VALUES(\$1,\$2,\$3) ON CONFLICT(filename) DO NOTHING',[f,cs,f]);
}
console.log('All migrations marked applied:', files.length);
await c.end();
"
```

---

## Step 6 — Mobile App .env

Create `ukc-mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://localhost:4000/api
EXPO_PUBLIC_SOCKET_URL=ws://localhost:4000
EXPO_PUBLIC_APP_ENV=development
```

---

## Step 7 — Install Dependencies

```
cd UKC.world/backend && npm install
cd ../../ukc-mobile && npm install
```

---

## Daily Startup (every time you open VS Code)

Open 3 terminals and run one command in each:

**Terminal 1 — PostgreSQL:**
```
powershell -File C:\PATH_TO_WORKSPACE\start-postgres.ps1
```

**Terminal 2 — Backend:**
```
cd UKC.world/backend
npm run dev
```

**Terminal 3 — Mobile:**
```
cd ukc-mobile
npx expo start
```

Then scan the QR code with **Expo Go** on your iPhone.

---

## Claude Code Settings (apply on new machine)

In your global Claude Code settings (`~/.claude/settings.json`), use:

```json
{
  "model": "sonnet",
  "effortLevel": "high",
  "skipDangerousModePermissionPrompt": true
}
```

To apply: open VS Code, press `Ctrl+Shift+P`, type `Claude Code: Open Settings`, and paste the above.

Or create the file directly at `C:\Users\YOUR_USERNAME\.claude\settings.json`.

---

## Git Workflow

All mobile work goes to the `mobile` branch:

```
cd ukc-mobile
git add .
git commit -m "feat: your description"
git push
```

**Never commit `UKC.world/` — it is read-only reference code.**

---

## Project Rules (for Claude)

- NEVER modify files in `UKC.world/` — read-only reference
- NEVER connect to `api.plannivo.com` (production) — always use `EXPO_PUBLIC_API_URL`
- ALWAYS use TypeScript — no `.js` files in `ukc-mobile/`
- ALWAYS handle loading, error, and empty states
- ALWAYS use `t()` for user-facing text (i18n)
- Commit format: `feat: description` or `fix: description`
- Read `ukc-mobile/plan/MOBILE_APP_PLAN.md` before implementing any new feature

## Tech Stack (mobile)

- Expo SDK 54, Managed Workflow, Expo Router v4
- TypeScript strict mode
- Zustand (auth, cart, UI state)
- TanStack React Query v5 (all server data)
- Socket.IO v4 client
- expo-secure-store (tokens — never AsyncStorage for secrets)
- react-i18next (Turkish + English)
- expo-image, @shopify/flash-list, react-native-reanimated, expo-haptics

## Database

- PostgreSQL running locally via embedded binaries (no system install needed)
- DB name: `ukcworld`, user: `ukcworld`, password: `ukcworld`, port: `5432`
- Backend auto-runs migrations on startup
- Data directory: `C:\ProgramData\ukcpostgres\data`
- PostgreSQL must be started manually each session via `start-postgres.ps1`
