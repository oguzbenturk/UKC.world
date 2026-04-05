-- Migration 152: Add downwinders and camps package types to constraint
-- Purpose: Allow event-based package types (downwinders, camps) in service_packages.package_type

-- Drop the old constraint
ALTER TABLE service_packages DROP CONSTRAINT IF EXISTS chk_service_packages_package_type;

-- Add the new constraint with downwinders and camps included
ALTER TABLE service_packages ADD CONSTRAINT chk_service_packages_package_type
CHECK (
    package_type IS NULL OR
    package_type IN (
        'lesson',
        'rental',
        'accommodation',
        'lesson_rental',
        'accommodation_lesson',
        'accommodation_rental',
        'all_inclusive',
        'downwinders',
        'camps'
    )
);

-- Add comment for documentation
COMMENT ON CONSTRAINT chk_service_packages_package_type ON service_packages IS 
    'Allowed package types: lesson, rental, accommodation, lesson_rental, accommodation_lesson, accommodation_rental, all_inclusive, downwinders, camps';
