-- Migration 045: Add raw_rate column to currency_settings
-- Stores the unmodified API-fetched rate before margin is applied.
-- exchange_rate = raw_rate × (1 + rate_margin_percent / 100)

ALTER TABLE currency_settings
ADD COLUMN IF NOT EXISTS raw_rate NUMERIC(10,4);

-- Backfill: reverse-calculate from existing exchange_rate + margin
UPDATE currency_settings
SET raw_rate = CASE
  WHEN rate_margin_percent > 0
    THEN exchange_rate / (1 + rate_margin_percent / 100.0)
  ELSE exchange_rate
END
WHERE raw_rate IS NULL;
