-- Migration 132: Add rental package support to customer_packages
-- This migration adds fields to support rental packages, combo packages, and accommodation packages

ALTER TABLE customer_packages 
ADD COLUMN IF NOT EXISTS package_type VARCHAR(50) DEFAULT 'lesson',
ADD COLUMN IF NOT EXISTS includes_lessons BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS includes_rental BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS includes_accommodation BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rental_days_total NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rental_days_used NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rental_days_remaining NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS accommodation_nights_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS accommodation_nights_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS accommodation_nights_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rental_service_id UUID REFERENCES services(id),
ADD COLUMN IF NOT EXISTS rental_service_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS accommodation_unit_id UUID,
ADD COLUMN IF NOT EXISTS accommodation_unit_name VARCHAR(255);

-- Add check constraints
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE customer_packages DROP CONSTRAINT IF EXISTS check_rental_days_valid;
    
    -- Add new constraint
    ALTER TABLE customer_packages ADD CONSTRAINT check_rental_days_valid 
    CHECK (
        rental_days_used >= 0 AND 
        rental_days_remaining >= 0 AND 
        rental_days_total >= 0
    );
END $$;

DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE customer_packages DROP CONSTRAINT IF EXISTS check_accommodation_nights_valid;
    
    -- Add new constraint
    ALTER TABLE customer_packages ADD CONSTRAINT check_accommodation_nights_valid 
    CHECK (
        accommodation_nights_used >= 0 AND 
        accommodation_nights_remaining >= 0 AND 
        accommodation_nights_total >= 0
    );
END $$;

-- Add indices for performance
CREATE INDEX IF NOT EXISTS idx_customer_packages_type ON customer_packages(package_type);
CREATE INDEX IF NOT EXISTS idx_customer_packages_includes_rental ON customer_packages(includes_rental) WHERE includes_rental = TRUE;
CREATE INDEX IF NOT EXISTS idx_customer_packages_rental_service ON customer_packages(rental_service_id) WHERE rental_service_id IS NOT NULL;

-- Update existing packages to set package_type based on what they include
UPDATE customer_packages
SET package_type = CASE
    WHEN total_hours > 0 AND includes_rental = FALSE AND includes_accommodation = FALSE THEN 'lesson'
    WHEN total_hours > 0 AND includes_rental = TRUE THEN 'combo'
    WHEN total_hours = 0 AND includes_rental = TRUE THEN 'rental'
    ELSE 'lesson'
END
WHERE package_type = 'lesson';

COMMENT ON COLUMN customer_packages.package_type IS 'Type of package: lesson, rental, combo, accommodation';
COMMENT ON COLUMN customer_packages.includes_lessons IS 'Whether this package includes lesson hours';
COMMENT ON COLUMN customer_packages.includes_rental IS 'Whether this package includes rental days';
COMMENT ON COLUMN customer_packages.includes_accommodation IS 'Whether this package includes accommodation nights';
COMMENT ON COLUMN customer_packages.rental_days_total IS 'Total rental days in package';
COMMENT ON COLUMN customer_packages.rental_days_used IS 'Rental days used';
COMMENT ON COLUMN customer_packages.rental_days_remaining IS 'Rental days remaining';
