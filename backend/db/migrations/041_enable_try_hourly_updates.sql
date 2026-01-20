-- Migration to enable hourly auto-update for TRY currency
-- This ensures TRY exchange rate is always fresh (updates every hour)
-- Prevents revenue loss from stale exchange rates

-- Check if the column exists first (for newer currency tables with auto_update_enabled)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'currency_settings' 
        AND column_name = 'auto_update_enabled'
    ) THEN
        -- Enable auto-update for TRY with hourly frequency
        UPDATE currency_settings 
        SET 
            auto_update_enabled = true,
            update_frequency_hours = 1
        WHERE currency_code = 'TRY';
        
        RAISE NOTICE 'Enabled hourly auto-update for TRY currency';
    ELSE
        RAISE NOTICE 'auto_update_enabled column does not exist - skipping';
    END IF;
END $$;

-- Add comment explaining the importance
COMMENT ON TABLE currency_settings IS 'Currency configuration with exchange rates. TRY is updated hourly to prevent revenue loss from stale rates.';
