-- 265_wallet_integrity_hardening.sql
-- Wallet audit hardening (Wave 1 — core integrity):
--   1. Idempotency key on the wallet ledger (+ UNIQUE backstop) so retries /
--      duplicate gateway webhooks can never double-debit or double-credit.
--   2. Per-wallet overdraft floor so an authorized negative balance is bounded
--      instead of bottomless.
--   3. Deposit-request dedupe so a brand-new reference_code cannot be inserted
--      twice under concurrency (the app-level FOR UPDATE check locks zero rows
--      when none exist yet).
--   4. Extend the non-negative guard trigger to fire on INSERT as well as UPDATE,
--      and to also protect pending / non_withdrawable from going negative.

-- 1. Idempotency key on the ledger -------------------------------------------------
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency_key
  ON wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Per-wallet overdraft floor (NULL = unlimited, preserves prior behaviour) ------
ALTER TABLE wallet_balances
  ADD COLUMN IF NOT EXISTS overdraft_limit NUMERIC(18, 4);

-- 3. Deposit-request dedupe (defensive: only create when no existing duplicates) ----
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT user_id, reference_code
      FROM wallet_deposit_requests
     WHERE reference_code IS NOT NULL
     GROUP BY user_id, reference_code
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_deposit_requests_user_ref
      ON wallet_deposit_requests (user_id, reference_code)
      WHERE reference_code IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping unique deposit index: % duplicate (user_id, reference_code) group(s) exist. Clean them, then re-run.', dup_count;
  END IF;
END $$;

-- 4. Harden the non-negative guard: INSERT + UPDATE, all three balance buckets ------
CREATE OR REPLACE FUNCTION wallet_guard_non_negative_balance()
RETURNS trigger AS $$
DECLARE
  allow_negative BOOLEAN := current_setting('wallet.allow_negative', true) = 'true';
BEGIN
  -- available may go negative only under an explicit (transaction-local) override
  IF NOT allow_negative AND NEW.available_amount < -0.0001 THEN
    RAISE EXCEPTION 'Wallet available amount cannot be negative. Wallet balance row: %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  -- pending / non_withdrawable must never be negative (no override)
  IF NEW.pending_amount < -0.0001 THEN
    RAISE EXCEPTION 'Wallet pending amount cannot be negative. Wallet balance row: %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.non_withdrawable_amount < -0.0001 THEN
    RAISE EXCEPTION 'Wallet non_withdrawable amount cannot be negative. Wallet balance row: %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_guard_non_negative_balance ON wallet_balances;

CREATE TRIGGER wallet_guard_non_negative_balance
BEFORE INSERT OR UPDATE ON wallet_balances
FOR EACH ROW
EXECUTE FUNCTION wallet_guard_non_negative_balance();
