-- Adds wallet KYC document tracking to support verification workflows

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS wallet_kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES wallet_payment_methods(id) ON DELETE SET NULL,
    document_type VARCHAR(80) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    file_url TEXT,
    storage_path TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_kyc_documents_user ON wallet_kyc_documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_kyc_documents_payment_method ON wallet_kyc_documents(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_wallet_kyc_documents_status ON wallet_kyc_documents(status);
CREATE INDEX IF NOT EXISTS idx_wallet_kyc_documents_type ON wallet_kyc_documents(document_type);

ALTER TABLE wallet_bank_accounts
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
    ADD COLUMN IF NOT EXISTS verification_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE wallet_payment_methods
    ADD COLUMN IF NOT EXISTS verification_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS verification_notes TEXT,
    ADD COLUMN IF NOT EXISTS last_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_payment_methods_verification ON wallet_payment_methods(verification_status);
CREATE INDEX IF NOT EXISTS idx_wallet_bank_accounts_verification ON wallet_bank_accounts(verification_status);

-- Rollback helpers
-- DROP TABLE IF EXISTS wallet_kyc_documents CASCADE;
-- ALTER TABLE wallet_payment_methods DROP COLUMN IF EXISTS last_verified_by;
-- ALTER TABLE wallet_payment_methods DROP COLUMN IF EXISTS verification_notes;
-- ALTER TABLE wallet_payment_methods DROP COLUMN IF EXISTS verification_metadata;
-- ALTER TABLE wallet_bank_accounts DROP COLUMN IF EXISTS verification_notes;
-- ALTER TABLE wallet_bank_accounts DROP COLUMN IF EXISTS verified_at;
-- ALTER TABLE wallet_bank_accounts DROP COLUMN IF EXISTS verification_metadata;
-- ALTER TABLE wallet_bank_accounts DROP COLUMN IF EXISTS verification_status;
