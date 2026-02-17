-- Adds support for configurable bank transfer accounts and metadata on deposit requests

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS wallet_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_type VARCHAR(50) NOT NULL DEFAULT 'global',
    scope_id UUID,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    bank_name VARCHAR(150),
    account_holder VARCHAR(150),
    account_number VARCHAR(50),
    iban VARCHAR(42),
    swift_code VARCHAR(20),
    routing_number VARCHAR(20),
    instructions TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_bank_accounts_scope ON wallet_bank_accounts(scope_type, scope_id, is_active);
CREATE INDEX IF NOT EXISTS idx_wallet_bank_accounts_currency ON wallet_bank_accounts(currency);
CREATE INDEX IF NOT EXISTS idx_wallet_bank_accounts_primary ON wallet_bank_accounts(scope_type, scope_id, currency, is_primary) WHERE is_primary = true;

ALTER TABLE wallet_deposit_requests
    ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES wallet_bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_reference_code VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_requests_bank_account
    ON wallet_deposit_requests(bank_account_id);

-- Rollback helpers
-- DROP INDEX IF EXISTS idx_wallet_deposit_requests_bank_account;
-- ALTER TABLE wallet_deposit_requests DROP COLUMN IF EXISTS bank_reference_code;
-- ALTER TABLE wallet_deposit_requests DROP COLUMN IF EXISTS bank_account_id;
-- DROP TABLE IF EXISTS wallet_bank_accounts CASCADE;
