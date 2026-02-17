-- Stores incoming payment gateway webhook payloads for idempotent processing

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS payment_gateway_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(120),
    status VARCHAR(50),
    external_id VARCHAR(200),
    transaction_id VARCHAR(200),
    deposit_id UUID REFERENCES wallet_deposit_requests(id) ON DELETE SET NULL,
    dedupe_key VARCHAR(255) NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    acknowledged_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_webhook_events_provider
    ON payment_gateway_webhook_events(provider);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_webhook_events_deposit
    ON payment_gateway_webhook_events(deposit_id);

-- Rollback helpers
-- DROP INDEX IF EXISTS idx_payment_gateway_webhook_events_deposit;
-- DROP INDEX IF EXISTS idx_payment_gateway_webhook_events_provider;
-- DROP TABLE IF EXISTS payment_gateway_webhook_events;
