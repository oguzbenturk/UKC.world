-- Fix Private Lessons to have correct max_participants = 1
-- This ensures private lessons are properly filtered when multiple participants are selected

-- Update Private Lessons services to have max_participants = 1
UPDATE services 
SET max_participants = 1, 
    updated_at = NOW()
WHERE name ILIKE '%private%lesson%' 
   OR (service_type = 'private' AND category = 'lesson')
   OR (service_type = 'private' AND category = 'lessons');

-- Also update any other services that should be private (1 person max)
UPDATE services 
SET max_participants = 1, 
    updated_at = NOW()
WHERE service_type = 'private' 
  AND (category ILIKE '%lesson%' OR name ILIKE '%lesson%')
  AND max_participants IS NULL;

-- Verify the changes
SELECT id, name, category, service_type, max_participants 
FROM services 
WHERE name ILIKE '%lesson%' 
   OR category ILIKE '%lesson%'
ORDER BY name;
