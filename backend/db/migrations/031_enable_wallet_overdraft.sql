-- Allow wallet balances to go negative when explicitly authorized via session setting
-- This updates the non-negative guard trigger to respect a session flag.

CREATE OR REPLACE FUNCTION wallet_guard_non_negative_balance()
RETURNS trigger AS $$
DECLARE
  allow_negative BOOLEAN := COALESCE(current_setting('wallet.allow_negative', true), 'false')::BOOLEAN;
BEGIN
  IF NOT allow_negative AND NEW.available_amount < 0 THEN
    RAISE EXCEPTION 'Wallet available amount cannot be negative. Wallet balance row: %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_guard_non_negative_balance ON wallet_balances;

CREATE TRIGGER wallet_guard_non_negative_balance
BEFORE UPDATE ON wallet_balances
FOR EACH ROW
EXECUTE FUNCTION wallet_guard_non_negative_balance();
