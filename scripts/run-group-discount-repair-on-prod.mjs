// Operational runner: apply backend/scripts/repair-group-discount-split.mjs on
// PRODUCTION. Ships the repair into the deployed backend container and runs it
// there, so it uses the same recordTransaction / applyDiscount code paths (and
// therefore the same wallet_balances, audit and cascade behaviour) as the app.
//
//   node scripts/run-group-discount-repair-on-prod.mjs --check   # DRY RUN on prod (no writes)
//   node scripts/run-group-discount-repair-on-prod.mjs           # apply (idempotent)
//
// ORDER MATTERS: deploy the code fixes FIRST (npm run push-all), then run this.
// Part 2 rewrites one group-wide discount row into one row per participant; until
// walletService.fetchTransactions carries the wallet-scoped discount LATERAL,
// Financial History would net EVERY participant's charge by the SUM of the new
// rows. The ledger would still be correct, but the screen would not be.
//
// The repair is idempotent: Part 1 is keyed on idempotency_key, Part 2 finds
// nothing once the NULL-participant rows are gone.

import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const DB = 'plannivo_db_1';
const APP = 'plannivo_backend_1';
const SCRIPT = 'repair-group-discount-split.mjs';
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

// Everyone the repair can touch: participants of a live group booking carrying a
// NULL-participant discount, plus anyone holding a net credit on a deleted booking.
const AFFECTED_SQL = `
  SELECT DISTINCT bp.user_id
    FROM discounts d
    JOIN bookings b ON b.id::text = d.entity_id AND b.deleted_at IS NULL
    JOIN booking_participants bp ON bp.booking_id = b.id
   WHERE d.entity_type = 'booking' AND d.participant_user_id IS NULL
   UNION
  SELECT wt.user_id
    FROM wallet_transactions wt
    JOIN bookings b2 ON b2.id = wt.booking_id AND b2.deleted_at IS NOT NULL
   WHERE wt.status = 'completed'
   GROUP BY wt.user_id, wt.booking_id
  HAVING COALESCE(SUM(wt.available_delta), 0) > 0.005`;

const balancesSql = `
  SELECT u.name, wb.currency, wb.available_amount
    FROM wallet_balances wb JOIN users u ON u.id = wb.user_id
   WHERE wb.user_id IN (${AFFECTED_SQL})
   ORDER BY u.name, wb.currency;`;

try {
  console.log('=== prod containers ===');
  await run(`docker ps --format '{{.Names}}' | grep -iE 'backend|db' || true`);

  console.log('\n=== affected wallet balances BEFORE ===');
  await run(psql(balancesSql.replace(/\s+/g, ' ')));

  console.log(`\n=== shipping ${SCRIPT} into ${APP}:/app/scripts/ ===`);
  const script = fs.readFileSync(path.join(cwd, 'backend', 'scripts', SCRIPT), 'utf8');
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  await run(`echo '${b64}' | base64 -d | docker exec -i ${APP} sh -c 'cat > /app/scripts/${SCRIPT}'`);

  console.log(checkOnly ? '\n=== DRY RUN on prod (no writes) ===' : '\n=== APPLYING on prod ===');
  const r = await run(`docker exec ${APP} node scripts/${SCRIPT}${checkOnly ? '' : ' --apply'}`);

  if (!checkOnly) {
    console.log('\n=== affected wallet balances AFTER ===');
    await run(psql(balancesSql.replace(/\s+/g, ' ')));

    console.log('=== cache-vs-ledger drift check (must be empty) ===');
    await run(psql(
      `SELECT u.name, wb.currency, wb.available_amount, l.s FROM wallet_balances wb ` +
      `JOIN users u ON u.id = wb.user_id ` +
      `JOIN LATERAL (SELECT COALESCE(SUM(available_delta),0) s FROM wallet_transactions wt ` +
      `WHERE wt.user_id = wb.user_id AND wt.currency = wb.currency AND wt.status = 'completed') l ON true ` +
      `WHERE ABS(wb.available_amount - l.s) > 0.005;`
    ));
  }

  if (r.code !== 0) { console.error('\n❌ repair script exited non-zero'); process.exitCode = 1; }
} catch (e) {
  console.error('Runner error:', e.message);
  process.exitCode = 1;
} finally {
  ssh.dispose();
}
