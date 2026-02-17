-- Migration: Add currency column to instructor_earnings table
-- This ensures instructor commissions are tracked with their proper currency
-- Previously, earnings were stored as numbers without knowing what currency they're in

-- Add currency column to instructor_earnings
ALTER TABLE instructor_earnings 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';

-- Create index for currency lookups
CREATE INDEX IF NOT EXISTS idx_instructor_earnings_currency 
ON instructor_earnings(currency);

-- Backfill currency from associated bookings
-- This updates existing records to use the booking's currency
UPDATE instructor_earnings ie
SET currency = COALESCE(b.currency, 'EUR')
FROM bookings b
WHERE ie.booking_id = b.id
AND (ie.currency IS NULL OR ie.currency = 'EUR');

-- Add comment explaining the currency column
COMMENT ON COLUMN instructor_earnings.currency IS 'The currency of the earnings amount (e.g., EUR, TRY, USD). Derived from the associated booking currency.';

-- Remove the default after backfill (optional - keeps it for future inserts that don't specify)
-- ALTER TABLE instructor_earnings ALTER COLUMN currency DROP DEFAULT;
