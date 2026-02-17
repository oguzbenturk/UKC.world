-- Adds wallet deposit request tracking for deposits awaiting processing

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS wallet_deposit_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    amount NUMERIC(18, 4) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    reference_code VARCHAR(100),
    proof_url TEXT,
    gateway VARCHAR(50),
    gateway_transaction_id VARCHAR(120),
    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    failure_reason TEXT,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_requests_user_status
    ON wallet_deposit_requests(user_id, status);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_requests_status
    ON wallet_deposit_requests(status);
