-- Migration 037: Enhance currency_settings for auto-update functionality
-- Description: Add columns to support automatic and manual exchange rate updates

-- Add auto-update control columns
ALTER TABLE currency_settings 
ADD COLUMN IF NOT EXISTS auto_update_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS update_frequency_hours INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_update_status VARCHAR(20) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS last_update_source VARCHAR(50);

-- Add comment explaining the columns
COMMENT ON COLUMN currency_settings.auto_update_enabled IS 'When true, exchange rate is automatically fetched from external API';
COMMENT ON COLUMN currency_settings.update_frequency_hours IS 'How often to auto-update (1=hourly, 6=every 6 hours, 24=daily)';
COMMENT ON COLUMN currency_settings.last_updated_at IS 'Timestamp of last rate update';
COMMENT ON COLUMN currency_settings.last_update_status IS 'Status of last update: success, failed, manual';
COMMENT ON COLUMN currency_settings.last_update_source IS 'Source of rate: google, ecb, manual, cached';

-- Index for efficient cron job queries
CREATE INDEX IF NOT EXISTS idx_currency_settings_auto_update 
ON currency_settings(auto_update_enabled, last_updated_at);

-- Initialize existing currencies with manual mode
UPDATE currency_settings 
SET auto_update_enabled = false,
    update_frequency_hours = 6,
    last_update_status = 'manual',
    last_updated_at = NOW()
WHERE auto_update_enabled IS NULL;

-- Rollback
-- ALTER TABLE currency_settings 
-- DROP COLUMN IF EXISTS auto_update_enabled,
-- DROP COLUMN IF EXISTS update_frequency_hours,
-- DROP COLUMN IF EXISTS last_updated_at,
-- DROP COLUMN IF EXISTS last_update_status,
-- DROP COLUMN IF EXISTS last_update_source;
