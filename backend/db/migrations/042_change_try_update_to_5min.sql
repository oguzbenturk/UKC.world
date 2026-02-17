-- Migration to change TRY auto-update frequency from 1 hour to 5 minutes
-- This provides near real-time exchange rates for better accuracy
-- 
-- ⚠️ WARNING: This increases API calls significantly
-- - 5 minutes = 12 calls/hour = 288 calls/day = 8,640 calls/month
-- - Make sure your exchange rate API plan supports this volume
-- - Free tiers typically allow 1,000-1,500 requests/month
-- 
-- Recommended: Use paid API tier or implement smart scheduling
-- (frequent updates during business hours, less frequent at night)

-- Change update frequency from 1 hour to 5 minutes (0.0833 hours)
UPDATE currency_settings 
SET update_frequency_hours = 0.0833  -- 5 minutes = 5/60 = 0.0833 hours
WHERE currency_code = 'TRY'
  AND auto_update_enabled = true;

-- Add comment explaining the frequency
COMMENT ON COLUMN currency_settings.update_frequency_hours IS 
    'Update frequency in hours. Examples: 1 = hourly, 0.0833 = 5 minutes, 0.5 = 30 minutes. Lower values increase API usage.';

-- Log the change
DO $$
DECLARE
    current_rate NUMERIC;
BEGIN
    SELECT exchange_rate INTO current_rate
    FROM currency_settings
    WHERE currency_code = 'TRY';
    
    RAISE NOTICE 'Changed TRY update frequency to 5 minutes (was 1 hour)';
    RAISE NOTICE 'Current rate: % TRY/EUR', current_rate;
    RAISE NOTICE 'API calls will increase from ~720/month to ~8,640/month';
    RAISE NOTICE 'Ensure your API plan supports this volume!';
END $$;
