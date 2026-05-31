// One-shot backfill: align wallet_balances cache with wallet_transactions ledger
// by inserting a `legacy_opening_balance` row for every drifted (user, currency).
//
// Why this exists:
//   The legacy customer import (backend/scripts/import_customers_*.mjs)
//   wrote into wallet_balances without a paired wallet_transactions row, so the
//   two tables disagreed for ~90 customers. The student-facing UI shows the cache
//   (-€245), the dashboard recompute shows the ledger (-€270), users notice.
//
// This script preserves every customer's current balance — it does NOT recompute
// wallet_balances. It only adds the missing ledger rows so a SUM over completed
// wallet_transactions equals wallet_balances.available_amount going forward.
//
// Idempotent: rerunning is a no-op (every drifted row gets one backfill, second
// run finds zero drift, second run inserts zero rows).
//
// Safety:
//   - Wrapped in a single BEGIN/COMMIT
//   - Creates wallet_balances_backup_YYYY_MM_DD before touching anything
//   - Verifies post-state: aborts (ROLLBACK) if any drift > 0.01 remains

import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

const todayTag = new Date().toISOString().slice(0, 10).replace(/-/g, '_'); // e.g. 2026_05_31
const backupTable = `wallet_balances_backup_${todayTag}`;

const sqlScript = `
BEGIN;

-- 1. Snapshot for rollback safety (re-creatable on rerun).
DROP TABLE IF EXISTS ${backupTable};
CREATE TABLE ${backupTable} AS SELECT *, NOW() AS backed_up_at FROM wallet_balances;

-- 2. Backfill: one legacy_opening_balance row per drifted (user, currency).
WITH truth AS (
  SELECT user_id, currency, COALESCE(SUM(available_delta),0) AS true_balance
    FROM wallet_transactions
   WHERE status = 'completed'
   GROUP BY user_id, currency
),
drift AS (
  SELECT wb.id   AS balance_id,
         wb.user_id,
         wb.currency,
         (wb.available_amount - COALESCE(t.true_balance,0)) AS delta
    FROM wallet_balances wb
    LEFT JOIN truth t ON t.user_id = wb.user_id AND t.currency = wb.currency
   WHERE ABS(wb.available_amount - COALESCE(t.true_balance,0)) > 0.01
)
INSERT INTO wallet_transactions
  (user_id, balance_id, transaction_type, status, direction, currency,
   amount, available_delta, description, metadata, transaction_date)
SELECT user_id,
       balance_id,
       'legacy_opening_balance',
       'completed',
       'adjustment',
       currency,
       delta,
       delta,
       'Opening balance migrated from previous app (backfill ${todayTag})',
       jsonb_build_object('source','backfill-wallet-opening-balances','run_date','${todayTag}'),
       NOW()
  FROM drift;

-- 3. Verify: zero rows should remain drifted. If any do, abort.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM wallet_balances wb
    LEFT JOIN (
      SELECT user_id, currency, COALESCE(SUM(available_delta),0) AS s
        FROM wallet_transactions WHERE status='completed'
       GROUP BY user_id, currency
    ) t ON t.user_id = wb.user_id AND t.currency = wb.currency
   WHERE ABS(wb.available_amount - COALESCE(t.s,0)) > 0.01;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Backfill verification failed: % rows still drifted', remaining;
  END IF;
END $$;

COMMIT;

-- 4. Post-commit summary for the operator.
SELECT 'backfill_count' AS metric,
       COUNT(*)::text AS value
  FROM wallet_transactions
 WHERE transaction_type = 'legacy_opening_balance'
   AND metadata->>'run_date' = '${todayTag}';

SELECT 'backup_table' AS metric, '${backupTable}' AS value;
SELECT 'backed_up_rows' AS metric, COUNT(*)::text AS value FROM ${backupTable};
`;

// Encode the SQL as base64 so it survives shell quoting, decode on the remote,
// pipe into psql's stdin. Avoids tempfile + heredoc fragility entirely.
const b64 = Buffer.from(sqlScript, 'utf8').toString('base64');

console.log('[backfill] Running on production…');
const r = await ssh.execCommand(
  `echo '${b64}' | base64 -d | docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -v ON_ERROR_STOP=1`
);

if (r.stdout) console.log(r.stdout);
if (r.stderr && !r.stderr.split('\n').every((l) => !l.trim() || l.includes('NOTICE'))) {
  console.error('[stderr]', r.stderr);
}

ssh.dispose();

if (r.code !== 0) {
  console.error(`\n[backfill] FAILED (exit ${r.code}). Backup table preserved if it was created.`);
  process.exit(1);
}

console.log(`\n[backfill] OK. Rollback if needed:`);
console.log(`  UPDATE wallet_balances wb SET available_amount = b.available_amount`);
console.log(`    FROM ${backupTable} b`);
console.log(`   WHERE wb.user_id = b.user_id AND wb.currency = b.currency;`);
console.log(`  DELETE FROM wallet_transactions`);
console.log(`   WHERE transaction_type = 'legacy_opening_balance'`);
console.log(`     AND metadata->>'run_date' = '${todayTag}';`);
process.exit(0);
