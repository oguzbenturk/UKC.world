-- Fix wallet_guard_non_negative_balance trigger function
-- Bug: COALESCE(current_setting('wallet.allow_negative', true), 'false') does not fall back
-- to 'false' because current_setting(..., true) returns '' (empty string, not NULL) when
-- the setting has not been set, and COALESCE only replaces NULL, not empty string.
-- Casting '' to BOOLEAN raises: invalid input syntax for type boolean: ""
--
-- Fix: use NULLIF to convert '' to NULL before COALESCE, or compare directly to 'true'.

CREATE OR REPLACE FUNCTION wallet_guard_non_negative_balance()
RETURNS trigger AS $$
DECLARE
  allow_negative BOOLEAN := current_setting('wallet.allow_negative', true) = 'true';
BEGIN
  IF NOT allow_negative AND NEW.available_amount < 0 THEN
    RAISE EXCEPTION 'Wallet available amount cannot be negative. Wallet balance row: %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
