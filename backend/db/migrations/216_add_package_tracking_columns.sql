-- Migration: Add rental and accommodation tracking columns to customer_packages
-- This allows proper tracking of combo packages that include rental days and accommodation nights

-- Add rental tracking columns
ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS rental_days_total INTEGER DEFAULT 0;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS rental_days_used INTEGER DEFAULT 0;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS rental_days_remaining INTEGER DEFAULT 0;

-- Add accommodation tracking columns
ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS accommodation_nights_total INTEGER DEFAULT 0;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS accommodation_nights_used INTEGER DEFAULT 0;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS accommodation_nights_remaining INTEGER DEFAULT 0;

-- Add package_type to know what kind of package this is
ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS package_type VARCHAR(32) DEFAULT 'lesson';

-- Add includes flags for quick filtering
ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS includes_lessons BOOLEAN DEFAULT TRUE;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS includes_rental BOOLEAN DEFAULT FALSE;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS includes_accommodation BOOLEAN DEFAULT FALSE;

-- Add service reference IDs for combo packages
ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS rental_service_id UUID;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS accommodation_unit_id UUID;

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS rental_service_name VARCHAR(255);

ALTER TABLE customer_packages
ADD COLUMN IF NOT EXISTS accommodation_unit_name VARCHAR(255);

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_customer_packages_package_type ON customer_packages(package_type);
CREATE INDEX IF NOT EXISTS idx_customer_packages_includes ON customer_packages(includes_lessons, includes_rental, includes_accommodation);

-- Update existing packages to set proper defaults
-- For existing packages, they're all lesson-only so remaining = total for rental/accommodation (both 0)
UPDATE customer_packages 
SET 
  rental_days_total = 0,
  rental_days_used = 0,
  rental_days_remaining = 0,
  accommodation_nights_total = 0,
  accommodation_nights_used = 0,
  accommodation_nights_remaining = 0,
  package_type = 'lesson',
  includes_lessons = TRUE,
  includes_rental = FALSE,
  includes_accommodation = FALSE
WHERE rental_days_total IS NULL;

-- Add constraint to ensure rental days are valid (use DO block to check if exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_rental_days_valid') THEN
    ALTER TABLE customer_packages
    ADD CONSTRAINT check_rental_days_valid 
    CHECK (rental_days_used >= 0 AND rental_days_remaining >= 0);
  END IF;
END $$;

-- Add constraint to ensure accommodation nights are valid
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_accommodation_nights_valid') THEN
    ALTER TABLE customer_packages
    ADD CONSTRAINT check_accommodation_nights_valid 
    CHECK (accommodation_nights_used >= 0 AND accommodation_nights_remaining >= 0);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN customer_packages.rental_days_total IS 'Total rental days included in the package';
COMMENT ON COLUMN customer_packages.rental_days_used IS 'Number of rental days used from this package';
COMMENT ON COLUMN customer_packages.rental_days_remaining IS 'Remaining rental days available in this package';
COMMENT ON COLUMN customer_packages.accommodation_nights_total IS 'Total accommodation nights included in the package';
COMMENT ON COLUMN customer_packages.accommodation_nights_used IS 'Number of accommodation nights used from this package';
COMMENT ON COLUMN customer_packages.accommodation_nights_remaining IS 'Remaining accommodation nights available in this package';
COMMENT ON COLUMN customer_packages.package_type IS 'Type of package: lesson, rental, accommodation, lesson_rental, accommodation_lesson, accommodation_rental, all_inclusive';
