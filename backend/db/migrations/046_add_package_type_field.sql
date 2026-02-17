-- Migration: Add package_type field to service_packages table
-- This allows for unified package management with different package types:
-- - lesson: Lesson-only packages
-- - rental: Rental equipment packages
-- - accommodation: Accommodation-only packages
-- - lesson_rental: Lesson + Rental combo packages
-- - accommodation_lesson: Accommodation + Lesson packages
-- - accommodation_rental: Accommodation + Rental packages
-- - all_inclusive: Accommodation + Lesson + Rental packages

-- Add package_type column
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS package_type VARCHAR(32) DEFAULT 'lesson';

-- Add description field for better package info
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add includes_accommodation boolean for quick filtering
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS includes_accommodation BOOLEAN DEFAULT FALSE;

-- Add includes_rental boolean for quick filtering
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS includes_rental BOOLEAN DEFAULT FALSE;

-- Add includes_lessons boolean for quick filtering
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS includes_lessons BOOLEAN DEFAULT TRUE;

-- Add accommodation_nights for accommodation packages
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS accommodation_nights INTEGER DEFAULT 0;

-- Add rental_days for rental packages
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS rental_days INTEGER DEFAULT 0;

-- Add image_url for package thumbnail
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update existing packages based on their tags
-- Rental packages
UPDATE service_packages 
SET package_type = 'rental',
    includes_rental = TRUE,
    includes_lessons = FALSE
WHERE (LOWER(discipline_tag) = 'rental' OR LOWER(lesson_category_tag) = 'rental')
  AND package_type = 'lesson';

-- Accommodation packages
UPDATE service_packages 
SET package_type = 'accommodation',
    includes_accommodation = TRUE,
    includes_lessons = FALSE
WHERE (LOWER(discipline_tag) = 'accommodation' OR LOWER(lesson_category_tag) = 'accommodation')
  AND package_type = 'lesson';

-- Create index for package_type queries
CREATE INDEX IF NOT EXISTS idx_service_packages_package_type ON service_packages(package_type);

-- Create composite index for filtering by includes flags
CREATE INDEX IF NOT EXISTS idx_service_packages_includes ON service_packages(includes_lessons, includes_rental, includes_accommodation);

-- Add comment for documentation
COMMENT ON COLUMN service_packages.package_type IS 'Type of package: lesson, rental, accommodation, lesson_rental, accommodation_lesson, accommodation_rental, all_inclusive';
COMMENT ON COLUMN service_packages.includes_accommodation IS 'Whether package includes accommodation';
COMMENT ON COLUMN service_packages.includes_rental IS 'Whether package includes equipment rental';
COMMENT ON COLUMN service_packages.includes_lessons IS 'Whether package includes lessons';
