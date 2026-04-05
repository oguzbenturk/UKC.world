-- Add rate margin/buffer to currency settings
-- This allows adding a small percentage to fetched rates to ensure we never lose money
-- 
-- Example: If API gives 50.2940 TRY/EUR and margin is 0.5%, final rate = 50.5456
-- This protects against rate fluctuations and matches Google's real-time rates

-- Add margin column (stored as percentage, e.g., 0.5 for 0.5%)
ALTER TABLE currency_settings 
ADD COLUMN IF NOT EXISTS rate_margin_percent NUMERIC(5,3) DEFAULT 0.0;

-- Set 0.5% margin for TRY to match Google's rates
UPDATE currency_settings 
SET rate_margin_percent = 0.5
WHERE currency_code = 'TRY';

-- Add comment
COMMENT ON COLUMN currency_settings.rate_margin_percent IS 
    'Percentage margin added to fetched exchange rates (e.g., 0.5 = 0.5%). Protects against rate fluctuations and ensures competitiveness with real-time rates.';

-- Log the change
DO $$
BEGIN
    RAISE NOTICE '✅ Added rate margin/buffer to currency settings';
    RAISE NOTICE '   TRY margin set to 0.5%% (adds ~0.25 TRY per EUR)';
    RAISE NOTICE '   This ensures we match or exceed Google Finance rates';
    RAISE NOTICE '   Example: 50.2940 + 0.5%% = 50.5456 TRY/EUR';
END $$;
