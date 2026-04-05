-- Adds payment method linkage and verification metadata to deposit requests

ALTER TABLE wallet_deposit_requests
    ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES wallet_payment_methods(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verification_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_requests_payment_method
    ON wallet_deposit_requests(payment_method_id);

-- Rollback helpers
-- DROP INDEX IF EXISTS idx_wallet_deposit_requests_payment_method;
-- ALTER TABLE wallet_deposit_requests DROP COLUMN IF EXISTS verification_metadata;
-- ALTER TABLE wallet_deposit_requests DROP COLUMN IF EXISTS payment_method_id;
