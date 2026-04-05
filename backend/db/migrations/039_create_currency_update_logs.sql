-- Migration 039: Create currency update logs table
-- Description: Audit trail for all exchange rate changes

CREATE TABLE IF NOT EXISTS currency_update_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_code VARCHAR(3) NOT NULL,
    old_rate NUMERIC(12, 6),
    new_rate NUMERIC(12, 6) NOT NULL,
    rate_change_percent NUMERIC(8, 4),
    source VARCHAR(50) NOT NULL, -- 'google', 'ecb', 'manual', 'cached'
    status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failed', 'fallback'
    error_message TEXT,
    triggered_by VARCHAR(50), -- 'cron', 'admin', 'api'
    triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_currency_update_logs_currency_date 
ON currency_update_logs(currency_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_currency_update_logs_status 
ON currency_update_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_currency_update_logs_source 
ON currency_update_logs(source);

-- Partition by month for large-scale deployments (optional)
-- CREATE INDEX IF NOT EXISTS idx_currency_update_logs_created_month 
-- ON currency_update_logs(date_trunc('month', created_at));

-- Add comments
COMMENT ON TABLE currency_update_logs IS 'Audit trail for all exchange rate updates';
COMMENT ON COLUMN currency_update_logs.rate_change_percent IS 'Percentage change from old to new rate';
COMMENT ON COLUMN currency_update_logs.triggered_by IS 'What triggered the update: cron job, admin action, or API call';

-- Rollback
-- DROP TABLE IF EXISTS currency_update_logs CASCADE;
