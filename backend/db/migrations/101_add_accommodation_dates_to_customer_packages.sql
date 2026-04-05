-- Migration: 101_add_accommodation_dates_to_customer_packages
-- Description: Add check-in and check-out date columns to customer_packages for accommodation packages
-- Date: 2025-01-19

-- Add check_in_date column
ALTER TABLE customer_packages 
ADD COLUMN IF NOT EXISTS check_in_date DATE;

-- Add check_out_date column
ALTER TABLE customer_packages 
ADD COLUMN IF NOT EXISTS check_out_date DATE;

-- Add index for finding packages by date range
CREATE INDEX IF NOT EXISTS idx_customer_packages_check_in 
ON customer_packages (check_in_date) 
WHERE check_in_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_packages_check_out 
ON customer_packages (check_out_date) 
WHERE check_out_date IS NOT NULL;

-- Add comment to columns
COMMENT ON COLUMN customer_packages.check_in_date IS 'Check-in date for accommodation packages';
COMMENT ON COLUMN customer_packages.check_out_date IS 'Check-out date for accommodation packages';
