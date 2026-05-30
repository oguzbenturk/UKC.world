// One-shot: fix Rifat Doğan's wallet balance from -260€ back to the correct -120€.
// Reverses the cancel+reversal double-count (incident 2026-05-30, booking 54f7447b).
//
// Plan, all inside a single transaction:
//   1. Hard-delete the reversal tx (45e8ba5e-...).
//   2. Un-cancel the original adjustment tx (1ea7b555-...) so it counts again.
//   3. Recompute wallet_balances.available_amount from completed transactions.
//   4. Verify and commit.
//
// Idempotent: re-running after step 1 already ran is a no-op (DELETE returns 0 rows,
// UPDATE matches no row).
import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

const USER_ID = '44435ecc-1809-48d1-ba4b-c355be99016b'; // Rifat Doğan
const ADJUSTMENT_ID = '1ea7b555-3824-4eae-83c1-c674cfde7ad6'; // booking_charge_adjustment +70 (cancelled)
const REVERSAL_ID = '45e8ba5e-4ced-47ff-851f-c1a8e902a8dd'; // booking_charge_adjustment_reversal -70 (completed)
const CURRENCY = 'EUR';

const sqlScript = `
BEGIN;

-- Allow the recompute to land a negative balance (-120€) without tripping the guard trigger.
SELECT set_config('wallet.allow_negative', 'true', false);

-- 1. Hard delete the reversal.
DELETE FROM wallet_transactions WHERE id = '${REVERSAL_ID}';

-- 2. Un-cancel the adjustment so its +70 counts again.
UPDATE wallet_transactions
   SET status = 'completed',
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'unCancelledAt', to_jsonb(now()),
         'unCancelReason', 'Reverse cancel+reversal double-count fix (2026-05-31)'
       ),
       updated_at = NOW()
 WHERE id = '${ADJUSTMENT_ID}' AND status = 'cancelled';

-- 3. Recompute wallet_balances from completed transactions.
UPDATE wallet_balances
   SET available_amount = COALESCE((
         SELECT SUM(available_delta) FROM wallet_transactions
          WHERE user_id = '${USER_ID}' AND currency = '${CURRENCY}' AND status = 'completed'
       ), 0),
       pending_amount = COALESCE((
         SELECT SUM(pending_delta) FROM wallet_transactions
          WHERE user_id = '${USER_ID}' AND currency = '${CURRENCY}' AND status = 'completed'
       ), 0),
       non_withdrawable_amount = COALESCE((
         SELECT SUM(non_withdrawable_delta) FROM wallet_transactions
          WHERE user_id = '${USER_ID}' AND currency = '${CURRENCY}' AND status = 'completed'
       ), 0),
       updated_at = NOW()
 WHERE user_id = '${USER_ID}' AND currency = '${CURRENCY}';

-- 4. Verify and commit.
SELECT id, transaction_type, status, available_delta FROM wallet_transactions
 WHERE user_id = '${USER_ID}' ORDER BY created_at ASC;
SELECT currency, available_amount FROM wallet_balances
 WHERE user_id = '${USER_ID}';

COMMIT;
`;

const r = await ssh.execCommand(
  `docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -v ON_ERROR_STOP=1`,
  { stdin: sqlScript }
);
console.log('STDOUT:\n' + (r.stdout || '(empty)'));
if (r.stderr) console.error('STDERR:\n' + r.stderr);

ssh.dispose();
process.exit(r.code === 0 ? 0 : 1);
