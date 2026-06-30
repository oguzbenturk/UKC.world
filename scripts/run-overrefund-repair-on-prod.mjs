// Operational runner: apply backend/scripts/repair-cenk-dilara-overrefund.mjs on
// PRODUCTION (claws back the two €6 phantom credits from deleted discounted
// memberships). Uses the deployed backend container's recordTransaction — the
// exact same code path verified locally — so wallet_balances + audit + guard
// all behave identically.
//
//   node scripts/run-overrefund-repair-on-prod.mjs --check   # read-only: show prod state + container
//   node scripts/run-overrefund-repair-on-prod.mjs           # apply (idempotent; guarded)
//
// The repair script is idempotent (idempotencyKey) and pre-state guarded, so a
// second apply is a no-op and an unexpected balance aborts before writing.

import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const DB = 'plannivo_db_1';
const APP = 'plannivo_backend_1';
const IDS = "'0c66214b-4734-46bd-96ae-1413f081788e','0a5b25aa-1c01-4f11-953d-b6ee39b40a70'";
const checkOnly = process.argv.includes('--check');

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

try {
  console.log('=== prod containers (confirm backend name) ===');
  await run(`docker ps --format '{{.Names}}' | grep -iE 'backend|db' || true`);

  console.log('\n=== prod balances BEFORE ===');
  await run(psql(
    `SELECT u.first_name, wb.currency, wb.available_amount FROM wallet_balances wb ` +
    `JOIN users u ON u.id=wb.user_id WHERE wb.user_id IN (${IDS}) ORDER BY u.first_name, wb.currency;`
  ));

  console.log('=== correction rows already present? ===');
  await run(psql(
    `SELECT user_id, idempotency_key, amount FROM wallet_transactions ` +
    `WHERE idempotency_key LIKE 'overrefund-correction:%';`
  ));

  if (checkOnly) {
    console.log('\n[--check] read-only; no changes made.');
  } else {
    console.log('\n=== transferring repair script into ' + APP + ':/app/scripts/ ===');
    const script = fs.readFileSync(path.join(cwd, 'backend', 'scripts', 'repair-cenk-dilara-overrefund.mjs'), 'utf8');
    const b64 = Buffer.from(script, 'utf8').toString('base64');
    await run(`echo '${b64}' | base64 -d | docker exec -i ${APP} sh -c 'cat > /app/scripts/repair-cenk-dilara-overrefund.mjs'`);

    console.log('=== running repair (recordTransaction, prod DB) ===');
    const r = await run(`docker exec ${APP} node scripts/repair-cenk-dilara-overrefund.mjs`);

    console.log('\n=== prod balances AFTER ===');
    await run(psql(
      `SELECT u.first_name, wb.currency, wb.available_amount FROM wallet_balances wb ` +
      `JOIN users u ON u.id=wb.user_id WHERE wb.user_id IN (${IDS}) ORDER BY u.first_name, wb.currency;`
    ));
    if (r.code !== 0) { console.error('\n❌ repair script exited non-zero'); process.exitCode = 1; }
  }
} catch (e) {
  console.error('Runner error:', e.message);
  process.exitCode = 1;
} finally {
  ssh.dispose();
}
