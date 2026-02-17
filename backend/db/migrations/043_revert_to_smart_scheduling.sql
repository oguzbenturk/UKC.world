-- Migration to revert TRY update frequency to use smart time-based scheduling
-- 
-- SMART SCHEDULING STRATEGY (Free Tier Optimized):
-- The ExchangeRateService now uses intelligent cron schedules:
-- - Business hours (9 AM - 7 PM): Every 1 hour
-- - Evening (7 PM - 11 PM): Every 2 hours  
-- - Night (11 PM - 9 AM): Every 4 hours
-- Total: ~14.5 updates/day × 30 days = ~435 updates/month
--
-- This stays well within free tier limits (500-750 updates/month)
-- while keeping rates fresh during peak business hours.
--
-- The update_frequency_hours column is kept for manual override capability,
-- but the actual scheduling is now time-aware and handled in code.

-- Set a nominal 1-hour frequency (scheduler will use smart timing)
UPDATE currency_settings 
SET update_frequency_hours = 1.0
WHERE currency_code = 'TRY'
  AND auto_update_enabled = true;

-- Update comment to reflect smart scheduling
COMMENT ON COLUMN currency_settings.update_frequency_hours IS 
    'Nominal update frequency in hours. Actual updates use smart time-based scheduling: frequent during business hours, less at night. See ExchangeRateService for details.';

-- Log the change
DO $$
DECLARE
    current_rate NUMERIC;
BEGIN
    SELECT exchange_rate INTO current_rate
    FROM currency_settings
    WHERE currency_code = 'TRY';
    
    RAISE NOTICE '✅ Enabled SMART scheduling for TRY currency updates';
    RAISE NOTICE '   Current rate: % TRY/EUR', current_rate;
    RAISE NOTICE '   📊 Business hours (9 AM - 7 PM): Every 1 hour';
    RAISE NOTICE '   🌆 Evening (7 PM - 11 PM): Every 2 hours';
    RAISE NOTICE '   🌙 Night (11 PM - 9 AM): Every 4 hours';
    RAISE NOTICE '   💰 ~14.5 updates/day = ~435/month (FREE TIER SAFE!)';
END $$;
