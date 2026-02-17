-- Migration: Populate lesson_service_name for existing packages
-- Date: 2026-01-08
-- Description: Updates existing service_packages to populate lesson_service_name from associated services

-- Update packages that are linked to services
UPDATE service_packages sp
SET 
    lesson_service_name = s.name,
    total_hours = s.duration * sp.sessions_count
FROM services s
WHERE s.package_id = sp.id
  AND (sp.lesson_service_name IS NULL OR sp.lesson_service_name = 'Unknown Service');

-- Log the update
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % packages with lesson_service_name from linked services', updated_count;
END $$;
