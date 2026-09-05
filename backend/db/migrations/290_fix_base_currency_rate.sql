-- Migration 290: pin the base currency's exchange rate to 1.0
--
-- Incident 2026-09-05: the EUR row (base_currency = true) was edited by hand in
-- Settings → Currency and stored as exchange_rate 57.085. Every conversion in the
-- system pivots through the base currency (amount / fromRate * toRate), so with
-- EUR ≠ 1 all cross-currency maths was skewed — e.g. Add Balance previewed
-- 500 TRY as "€507.42" instead of ~€8.89. (Wallet credits themselves were NOT
-- affected: the add-funds route divides by the source currency's rate only.)
--
-- 1. Audit + repair: log the correction, then reset the base row to 1.0.
-- 2. Guard: a CHECK constraint so no code path can ever store a base rate ≠ 1
--    again (the route/service now refuse it too; this is the belt to their braces).

INSERT INTO currency_update_logs (currency_code, old_rate, new_rate, source, status, triggered_by, error_message)
SELECT currency_code, exchange_rate, 1.0, 'manual', 'success', 'migration',
       'Migration 290: base currency rate reset to 1.0 (was ' || exchange_rate || ')'
FROM currency_settings
WHERE base_currency = true
  AND exchange_rate <> 1.0;

UPDATE currency_settings
SET exchange_rate = 1.0,
    raw_rate = 1.0,
    updated_at = NOW()
WHERE base_currency = true
  AND (exchange_rate <> 1.0 OR raw_rate IS DISTINCT FROM 1.0);

ALTER TABLE currency_settings DROP CONSTRAINT IF EXISTS currency_settings_base_rate_is_one;
ALTER TABLE currency_settings ADD CONSTRAINT currency_settings_base_rate_is_one
  CHECK (base_currency = false OR exchange_rate = 1.0);
