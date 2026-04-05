-- Migration 038: Add transaction transparency columns
-- Description: Store original amount/currency/rate for full audit trail

-- Add transparency columns to wallet_transactions
ALTER TABLE wallet_transactions 
ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3),
ADD COLUMN IF NOT EXISTS transaction_exchange_rate NUMERIC(12, 6);

-- Add comments
COMMENT ON COLUMN wallet_transactions.original_amount IS 'Original amount in customer currency (e.g., 1000 TRY)';
COMMENT ON COLUMN wallet_transactions.original_currency IS 'Customer currency code (e.g., TRY)';
COMMENT ON COLUMN wallet_transactions.transaction_exchange_rate IS 'Exchange rate used at transaction time';

-- Index for currency-based queries
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_original_currency 
ON wallet_transactions(original_currency) WHERE original_currency IS NOT NULL;

-- Add transparency columns to legacy transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3);

-- Comments for legacy table
COMMENT ON COLUMN transactions.original_amount IS 'Original amount in customer currency';
COMMENT ON COLUMN transactions.original_currency IS 'Customer currency code';

-- Rollback
-- ALTER TABLE wallet_transactions 
-- DROP COLUMN IF EXISTS original_amount,
-- DROP COLUMN IF EXISTS original_currency,
-- DROP COLUMN IF EXISTS transaction_exchange_rate;
-- ALTER TABLE transactions 
-- DROP COLUMN IF EXISTS original_amount,
-- DROP COLUMN IF EXISTS original_currency;
