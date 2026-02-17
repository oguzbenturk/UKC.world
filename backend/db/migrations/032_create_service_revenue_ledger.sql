-- Migration: create unified service revenue ledger
-- Purpose: track expected revenue across lessons, rentals, accommodations, and other services when they are fulfilled.

CREATE TABLE IF NOT EXISTS service_revenue_ledger (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    service_type text NOT NULL,
    service_subtype text,
    service_id uuid,
    customer_id uuid,
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency varchar(3) NOT NULL DEFAULT 'EUR',
    occurred_at timestamptz NOT NULL,
    status text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_range
    ON service_revenue_ledger (occurred_at);

CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_type
    ON service_revenue_ledger (service_type);

CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_status
    ON service_revenue_ledger (status);
