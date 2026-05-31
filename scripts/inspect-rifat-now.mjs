// Read-only inspection of Rifat Doğan's current wallet state on prod.
// User reports financial history doesn't match balance.
import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

const USER_ID = '44435ecc-1809-48d1-ba4b-c355be99016b';

async function sql(q, label) {
  const cmd = `docker exec plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -c "${q.replace(/"/g, '\\"')}"`;
  const r = await ssh.execCommand(cmd);
  console.log(`\n========== ${label} ==========`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('NOTICE')) console.error('[stderr]', r.stderr);
}

await sql(
  `SELECT currency, available_amount, pending_amount, non_withdrawable_amount, updated_at FROM wallet_balances WHERE user_id = '${USER_ID}';`,
  'wallet_balances current'
);

await sql(
  `SELECT id, transaction_type, status, available_delta, pending_delta, amount, direction, related_entity_type, related_entity_id, description, created_at FROM wallet_transactions WHERE user_id = '${USER_ID}' ORDER BY created_at ASC;`,
  'wallet_transactions all'
);

await sql(
  `SELECT
     SUM(CASE WHEN status='completed' THEN available_delta ELSE 0 END) AS sum_completed,
     SUM(CASE WHEN status='cancelled' THEN available_delta ELSE 0 END) AS sum_cancelled,
     COUNT(*) FILTER (WHERE status='completed') AS n_completed,
     COUNT(*) FILTER (WHERE status='cancelled') AS n_cancelled
   FROM wallet_transactions WHERE user_id = '${USER_ID}' AND currency = 'EUR';`,
  'sum by status (EUR)'
);

await sql(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings' ORDER BY ordinal_position;`,
  'bookings columns'
);

ssh.dispose();
process.exit(0);
