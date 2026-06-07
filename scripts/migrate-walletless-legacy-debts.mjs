// One-shot PROD runner: migrate wallet-less legacy debts into the wallet ledger.
//
// Runs backend/scripts/migrate_walletless_legacy_debts.sql on production. That SQL
// gives every customer who has a non-zero users.balance but NO wallet_balances row
// (old-app imported debts: Malek -1191, Dinçer -45, Weber -10) an EUR wallet + a
// paired `legacy_opening_balance` ledger entry — the same treatment the positive
// imports already got. After this, the admin list, the admin drawer, and the
// customer's own portal all read the debt from the wallet and agree.
//
// The SQL is idempotent (rerun = no-op), wrapped in BEGIN/COMMIT, snapshots a
// backup table, and self-verifies (aborts on any mismatch). Safe to run twice.
//
// Usage:  node scripts/migrate-walletless-legacy-debts.mjs
// Verify first locally:
//   Get-Content -Raw backend/scripts/migrate_walletless_legacy_debts.sql | \
//     docker exec -i plannivo-dev-db psql -U plannivo -d plannivo_dev -v ON_ERROR_STOP=1

import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const sqlScript = fs.readFileSync(
  path.join(cwd, 'backend', 'scripts', 'migrate_walletless_legacy_debts.sql'),
  'utf8'
);

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

// Encode as base64 so the SQL survives shell quoting, decode remotely, pipe into psql.
const b64 = Buffer.from(sqlScript, 'utf8').toString('base64');

console.log('[migrate-debts] Running on production…');
const r = await ssh.execCommand(
  `echo '${b64}' | base64 -d | docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -v ON_ERROR_STOP=1`
);

if (r.stdout) console.log(r.stdout);
if (r.stderr && !r.stderr.split('\n').every((l) => !l.trim() || l.includes('NOTICE'))) {
  console.error('[stderr]', r.stderr);
}

ssh.dispose();

if (r.code !== 0) {
  console.error(`\n[migrate-debts] FAILED (exit ${r.code}). Transaction rolled back; nothing changed.`);
  process.exit(1);
}

console.log(`\n[migrate-debts] OK. Rollback if ever needed:`);
console.log(`  DELETE FROM wallet_transactions`);
console.log(`   WHERE transaction_type='legacy_opening_balance'`);
console.log(`     AND metadata->>'source'='migrate-walletless-legacy-debts';`);
console.log(`  DELETE FROM wallet_balances wb`);
console.log(`   USING walletless_debt_backup_2026_06_07 b`);
console.log(`   WHERE wb.user_id=b.user_id AND wb.currency='EUR';`);
process.exit(0);
