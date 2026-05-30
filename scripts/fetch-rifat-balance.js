// Inspect metadata of the cancelled adjustment to trace what cancelled it.
import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

async function sql(q, label) {
  const cmd = `docker exec plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -c "${q.replace(/"/g, '\\"')}"`;
  const r = await ssh.execCommand(cmd);
  console.log(`\n========== ${label} ==========`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('NOTICE')) console.error('[stderr]', r.stderr);
}

await sql(
  `SELECT id, transaction_type, status, created_at, updated_at, jsonb_pretty(metadata) AS meta FROM wallet_transactions WHERE id IN ('1ea7b555-3824-4eae-83c1-c674cfde7ad6','45e8ba5e-4ced-47ff-851f-c1a8e902a8dd','6fd1109a-30c2-4a29-a815-fdb2537c5f7f');`,
  'Tx metadata of the 3 transactions'
);

// Audit logs for this user
await sql(
  `SELECT id, actor_user_id, action, jsonb_pretty(details) AS details, created_at FROM wallet_audit_logs WHERE wallet_user_id = '44435ecc-1809-48d1-ba4b-c355be99016b' ORDER BY created_at DESC LIMIT 10;`,
  'Wallet audit log'
);

// Booking history
await sql(
  `SELECT id, action, details::text, created_at FROM audit_logs WHERE created_at >= '2026-05-30' AND (details::text LIKE '%54f7447b%' OR details::text LIKE '%Rifat%') ORDER BY created_at DESC LIMIT 20;`,
  'General audit log for this booking/user'
);

ssh.dispose();
process.exit(0);
