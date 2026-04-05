-- Store Iyzico token on member_purchases so callback can look up by token
ALTER TABLE member_purchases ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT;
