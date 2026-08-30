// Operational runner: apply backend/scripts/repair-bank-transfer-package-ledger.mjs
// on PRODUCTION. Copies the script into the running backend container and executes
// it there, so it uses the deployed backend's own db.js + walletService
// (recomputeBalanceFromLedger) against the production database — no deploy needed.
//
//   node scripts/run-bank-transfer-ledger-repair-on-prod.mjs           # dry run (read-only)
//   node scripts/run-bank-transfer-ledger-repair-on-prod.mjs --apply   # write
//
// The repair is idempotent: a second apply finds nothing to change.

import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const APP = 'plannivo_backend_1';
const DB = 'plannivo_db_1';
const SCRIPT = 'repair-bank-transfer-package-ledger.mjs';
const LOCAL = path.join(cwd, 'backend', 'scripts', SCRIPT);
const REMOTE_TMP = `/tmp/${SCRIPT}`;
const apply = process.argv.includes('--apply');

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

const run = async (cmd) => {
  const r = await ssh.execCommand(cmd);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  return r;
};

const psql = (sql) =>
  `docker exec -i ${DB} psql -U plannivo -d plannivo -P pager=off -v ON_ERROR_STOP=1 -c "${sql.replace(/"/g, '\\"')}"`;

const affectedBalances =
  `SELECT u.first_name || ' ' || u.last_name AS customer, wb.currency, wb.available_amount ` +
  `FROM wallet_balances wb JOIN users u ON u.id = wb.user_id ` +
  `WHERE wb.user_id IN (SELECT user_id FROM wallet_transactions ` +
  `WHERE transaction_type = 'package_purchase' AND metadata->>'source' = 'services:packages:self-purchase' ` +
  `AND payment_method = 'bank_transfer') ORDER BY customer, wb.currency;`;

try {
  console.log('=== balances BEFORE ===');
  await run(psql(affectedBalances));

  console.log(`\n=== copying ${SCRIPT} into ${APP} ===`);
  await ssh.putFile(LOCAL, REMOTE_TMP);
  const cp = await run(`docker cp ${REMOTE_TMP} ${APP}:/app/scripts/${SCRIPT}`);
  if (cp.code !== 0) throw new Error('docker cp failed');

  console.log(`\n=== running repair ${apply ? '(APPLY)' : '(dry run)'} ===`);
  const res = await run(`docker exec ${APP} node scripts/${SCRIPT}${apply ? ' --apply' : ''}`);

  if (apply) {
    console.log('\n=== balances AFTER ===');
    await run(psql(affectedBalances));
    console.log('=== cache vs ledger drift check (should be empty) ===');
    await run(psql(
      `SELECT u.email, wb.currency, wb.available_amount, COALESCE(SUM(wt.available_delta) FILTER (WHERE wt.status='completed'), 0) AS ledger ` +
      `FROM wallet_balances wb JOIN users u ON u.id = wb.user_id ` +
      `LEFT JOIN wallet_transactions wt ON wt.user_id = wb.user_id AND wt.currency = wb.currency ` +
      `GROUP BY u.email, wb.currency, wb.available_amount ` +
      `HAVING ABS(wb.available_amount - COALESCE(SUM(wt.available_delta) FILTER (WHERE wt.status='completed'), 0)) > 0.01;`
    ));
  }

  await run(`docker exec ${APP} rm -f /app/scripts/${SCRIPT}; rm -f ${REMOTE_TMP}`);
  process.exitCode = res.code === 0 ? 0 : 1;
} finally {
  ssh.dispose();
}
