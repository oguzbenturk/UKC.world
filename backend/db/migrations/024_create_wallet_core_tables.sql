-- Creates foundational tables for the new wallet system

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Wallet balances per user & currency
CREATE TABLE IF NOT EXISTS wallet_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    available_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
    pending_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
    non_withdrawable_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
    last_transaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_wallet_balances_user_currency ON wallet_balances(user_id, currency);

-- Ledger of immutable wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_id UUID REFERENCES wallet_balances(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit', 'adjustment')),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    amount NUMERIC(18, 4) NOT NULL,
    available_delta NUMERIC(18, 4) NOT NULL DEFAULT 0,
    pending_delta NUMERIC(18, 4) NOT NULL DEFAULT 0,
    non_withdrawable_delta NUMERIC(18, 4) NOT NULL DEFAULT 0,
    balance_available_after NUMERIC(18, 4),
    balance_pending_after NUMERIC(18, 4),
    balance_non_withdrawable_after NUMERIC(18, 4),
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    related_entity_type VARCHAR(50),
    related_entity_id UUID,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_date ON wallet_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_related ON wallet_transactions(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(transaction_type);

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS wallet_withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_method_id UUID,
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    auto_approved BOOLEAN DEFAULT false,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_wallet_withdrawal_user_status ON wallet_withdrawal_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_withdrawal_status ON wallet_withdrawal_requests(status);

-- Wallet settings (per tenant/company scope)
CREATE TABLE IF NOT EXISTS wallet_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_type VARCHAR(50) NOT NULL DEFAULT 'global',
    scope_id UUID,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    is_default BOOLEAN NOT NULL DEFAULT false,
    discount_percent NUMERIC(6, 4) NOT NULL DEFAULT 0,
    card_fee_percent NUMERIC(6, 4) NOT NULL DEFAULT 0,
    withdrawal_auto_approve_after_hours INTEGER DEFAULT 12,
    withdrawal_processing_time_days INTEGER DEFAULT 1,
    allow_mixed_payments BOOLEAN NOT NULL DEFAULT true,
    auto_use_wallet_first BOOLEAN NOT NULL DEFAULT true,
    require_kyc_for_withdrawals BOOLEAN NOT NULL DEFAULT true,
    enabled_gateways TEXT[] NOT NULL DEFAULT ARRAY['stripe', 'iyzico', 'paytr', 'binance_pay'],
    preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_settings_scope ON wallet_settings(scope_type, scope_id, currency);
CREATE INDEX IF NOT EXISTS idx_wallet_settings_default ON wallet_settings(is_default) WHERE is_default = true;

-- Stored payment methods (masked)
CREATE TABLE IF NOT EXISTS wallet_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    masked_identifier VARCHAR(100),
    external_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
    verified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_payment_methods_user ON wallet_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payment_methods_provider ON wallet_payment_methods(provider);

-- Promotions / bonus credits
CREATE TABLE IF NOT EXISTS wallet_promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR' REFERENCES currency_settings(currency_code),
    expires_at TIMESTAMPTZ,
    usage_limit INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    terms TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, currency)
);

CREATE INDEX IF NOT EXISTS idx_wallet_promotions_status ON wallet_promotions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_promotions_user ON wallet_promotions(user_id);

-- Wallet audit logs
CREATE TABLE IF NOT EXISTS wallet_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_wallet ON wallet_audit_logs(wallet_user_id, created_at DESC);

-- Rollback
-- DROP TABLE IF EXISTS wallet_audit_logs CASCADE;
-- DROP TABLE IF EXISTS wallet_promotions CASCADE;
-- DROP TABLE IF EXISTS wallet_payment_methods CASCADE;
-- DROP TABLE IF EXISTS wallet_settings CASCADE;
-- DROP TABLE IF EXISTS wallet_withdrawal_requests CASCADE;
-- DROP TABLE IF EXISTS wallet_transactions CASCADE;
-- DROP TABLE IF EXISTS wallet_balances CASCADE;
