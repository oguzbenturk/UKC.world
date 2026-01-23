-- Migration: Add customer_package_id to rentals table for package-based rental tracking
-- This allows rentals to be associated with a customer package (combo packages with rental days)

-- Add column for linking rentals to customer packages
ALTER TABLE rentals
ADD COLUMN IF NOT EXISTS customer_package_id UUID REFERENCES customer_packages(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rentals_customer_package_id ON rentals(customer_package_id) WHERE customer_package_id IS NOT NULL;

-- Add rental_days column to track how many days were used for this rental
ALTER TABLE rentals
ADD COLUMN IF NOT EXISTS rental_days_used INTEGER DEFAULT 1;

COMMENT ON COLUMN rentals.customer_package_id IS 'Reference to customer_packages if rental used package rental days instead of wallet payment';
COMMENT ON COLUMN rentals.rental_days_used IS 'Number of rental days from package used for this rental';
