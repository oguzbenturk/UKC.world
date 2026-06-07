-- Migrate wallet-less legacy debts into the wallet ledger.
--
-- Why this exists:
--   The old-app import (import_customers_to_prod.mjs) put NEGATIVE balances (debts)
--   ONLY into users.balance (EUR), with NO wallet_balances row and NO ledger entry,
--   while POSITIVE balances got a wallet + a paired legacy_opening_balance txn.
--   Result: debtors showed €0 on every wallet-driven surface (customer portal, and
--   the admin drawer before the 2026-06-07 staff-only fallback). This script gives
--   those debtors the SAME treatment the credits already got: an EUR wallet_balances
--   row equal to the debt + a paired `legacy_opening_balance` wallet_transactions row.
--   After this, list + admin drawer + customer portal all read the debt from the
--   wallet and agree, and the staff-only fallback in /finances/accounts/:id becomes a
--   harmless no-op.
--
-- Scope: customers (student/outsider/trusted_customer, not soft-deleted) with a
--   non-zero users.balance AND zero wallet_balances rows. On synced prod 2026-06-07
--   that is exactly Malek KS23 (-1191), Dinçer Yazgan (-45), Weber Guillaume (-10).
--
-- Safety:
--   - Single BEGIN/COMMIT.
--   - Snapshot table walletless_debt_backup_2026_06_07 for rollback reference.
--   - Post-state verification: aborts (ROLLBACK) if any migrated user's wallet or
--     ledger sum disagrees with the original users.balance.
--   - Idempotent: rerun recomputes the (now empty) candidate set and inserts nothing.
--
-- Rollback (if ever needed):
--   DELETE FROM wallet_transactions
--    WHERE transaction_type='legacy_opening_balance'
--      AND metadata->>'source'='migrate-walletless-legacy-debts';
--   DELETE FROM wallet_balances wb
--    USING walletless_debt_backup_2026_06_07 b
--    WHERE wb.user_id=b.user_id AND wb.currency='EUR';

BEGIN;

-- 1. Snapshot the exact candidate set (re-creatable on rerun).
DROP TABLE IF EXISTS walletless_debt_backup_2026_06_07;
CREATE TABLE walletless_debt_backup_2026_06_07 AS
SELECT u.id AS user_id, u.balance, NOW() AS backed_up_at
  FROM users u
  JOIN roles r ON r.id = u.role_id
 WHERE r.name IN ('student', 'outsider', 'trusted_customer')
   AND u.deleted_at IS NULL
   AND u.balance IS NOT NULL
   AND u.balance <> 0
   AND NOT EXISTS (SELECT 1 FROM wallet_balances wb WHERE wb.user_id = u.id);

-- 2. Create the EUR wallet_balances row holding the legacy balance.
INSERT INTO wallet_balances (user_id, currency, available_amount, last_transaction_at)
SELECT b.user_id, 'EUR', b.balance, NOW()
  FROM walletless_debt_backup_2026_06_07 b
ON CONFLICT (user_id, currency) DO NOTHING;

-- 3. Create the paired legacy_opening_balance ledger row so a SUM over completed
--    wallet_transactions equals wallet_balances.available_amount going forward.
INSERT INTO wallet_transactions
  (user_id, balance_id, transaction_type, status, direction, currency,
   amount, available_delta, description, metadata, transaction_date)
SELECT b.user_id, wb.id, 'legacy_opening_balance', 'completed', 'adjustment', 'EUR',
       b.balance, b.balance,
       'Opening balance migrated from previous app (wallet-less debt backfill 2026-06-07)',
       jsonb_build_object('source', 'migrate-walletless-legacy-debts', 'run_date', '2026_06_07'),
       NOW()
  FROM walletless_debt_backup_2026_06_07 b
  JOIN wallet_balances wb ON wb.user_id = b.user_id AND wb.currency = 'EUR'
 WHERE NOT EXISTS (
   SELECT 1 FROM wallet_transactions wt
    WHERE wt.user_id = b.user_id
      AND wt.transaction_type = 'legacy_opening_balance'
      AND wt.metadata->>'source' = 'migrate-walletless-legacy-debts'
 );

-- 4. Verify: every migrated user's wallet available_amount AND completed-ledger sum
--    must equal the original users.balance. Abort otherwise.
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad
    FROM walletless_debt_backup_2026_06_07 b
    JOIN wallet_balances wb ON wb.user_id = b.user_id AND wb.currency = 'EUR'
   WHERE ABS(wb.available_amount - b.balance) > 0.01;
  IF bad > 0 THEN RAISE EXCEPTION 'wallet_balances mismatch for % migrated user(s)', bad; END IF;

  SELECT COUNT(*) INTO bad
    FROM walletless_debt_backup_2026_06_07 b
    LEFT JOIN (
      SELECT user_id, COALESCE(SUM(available_delta), 0) AS s
        FROM wallet_transactions WHERE status = 'completed' GROUP BY user_id
    ) t ON t.user_id = b.user_id
   WHERE ABS(COALESCE(t.s, 0) - b.balance) > 0.01;
  IF bad > 0 THEN RAISE EXCEPTION 'ledger sum mismatch for % migrated user(s)', bad; END IF;
END $$;

COMMIT;

-- 5. Operator summary.
SELECT 'migrated_users' AS metric, COUNT(*)::text AS value FROM walletless_debt_backup_2026_06_07;
SELECT b.user_id, u.name, b.balance AS migrated_balance
  FROM walletless_debt_backup_2026_06_07 b JOIN users u ON u.id = b.user_id
 ORDER BY b.balance;
