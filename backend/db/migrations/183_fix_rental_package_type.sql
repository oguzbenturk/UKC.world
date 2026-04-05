-- Migration 183: Fix rental packages that were mis-tagged as 'lesson' type
-- The old RentalPackageManager code set discipline_tag='rental' and lesson_category_tag='rental'
-- instead of using the proper package_type/includes_rental fields.
-- This migration corrects those packages.

-- Fix packages that have rental tags but wrong package_type
UPDATE service_packages
SET package_type = 'rental',
    includes_rental = true,
    includes_lessons = false,
    discipline_tag = NULL,
    lesson_category_tag = NULL
WHERE (
  -- Packages created by old RentalPackageManager with legacy tags
  (discipline_tag = 'rental' OR lesson_category_tag = 'rental')
  OR
  -- Packages with a rental_service_id but still tagged as lesson
  (rental_service_id IS NOT NULL AND package_type = 'lesson')
  OR
  -- Packages with no rental fields but lesson_service_name referencing rentals
  (lesson_service_name ILIKE '%Rental%' AND package_type = 'lesson' AND includes_rental = false)
)
AND package_type NOT IN ('rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive');
