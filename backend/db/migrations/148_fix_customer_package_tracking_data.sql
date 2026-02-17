-- Migration: Fix customer_packages tracking data for rental and accommodation packages
-- This updates existing customer_packages to have proper rental_days_total and accommodation_nights_total
-- based on the package name patterns (e.g., "3 days rental" should have rental_days_total = 3)

-- Update rental packages that have "X days rental" pattern in name
-- Extract the number of days from the package name
UPDATE customer_packages
SET 
  rental_days_total = COALESCE(
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*days?\s*rental', 'i'))[1],
      ''
    )::INTEGER,
    3  -- Default to 3 if pattern not matched but package includes rental
  ),
  rental_days_remaining = COALESCE(
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*days?\s*rental', 'i'))[1],
      ''
    )::INTEGER,
    3
  ),
  rental_days_used = 0,
  includes_rental = TRUE,
  package_type = CASE 
    WHEN package_name ~* 'stay|accommodation' THEN 'lesson_rental'
    ELSE 'rental'
  END
WHERE (
  package_name ~* 'rental'
  OR includes_rental = TRUE
)
AND (rental_days_total IS NULL OR rental_days_total = 0);

-- Update accommodation packages that have "X days stay" or "X nights" pattern
UPDATE customer_packages
SET 
  accommodation_nights_total = COALESCE(
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*days?\s*stay', 'i'))[1],
      ''
    )::INTEGER,
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*nights?', 'i'))[1],
      ''
    )::INTEGER,
    3  -- Default to 3 if pattern not matched but package includes accommodation
  ),
  accommodation_nights_remaining = COALESCE(
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*days?\s*stay', 'i'))[1],
      ''
    )::INTEGER,
    NULLIF(
      (regexp_match(package_name, '(\d+)\s*nights?', 'i'))[1],
      ''
    )::INTEGER,
    3
  ),
  accommodation_nights_used = 0,
  includes_accommodation = TRUE,
  package_type = CASE 
    WHEN package_name ~* 'rental' THEN 'accommodation_rental'
    WHEN package_name ~* 'lesson|private|group|pack' THEN 'accommodation_lesson'
    ELSE 'accommodation'
  END
WHERE (
  package_name ~* 'stay|accommodation|nights?'
  OR includes_accommodation = TRUE
)
AND (accommodation_nights_total IS NULL OR accommodation_nights_total = 0);

-- Update package_type for combo packages that have both rental and accommodation
UPDATE customer_packages
SET package_type = 'all_inclusive'
WHERE includes_rental = TRUE 
  AND includes_accommodation = TRUE 
  AND (total_hours > 0 OR includes_lessons = TRUE);

-- Also update service_packages with the same logic
UPDATE service_packages
SET 
  rental_days = COALESCE(
    NULLIF(
      (regexp_match(name, '(\d+)\s*days?\s*rental', 'i'))[1],
      ''
    )::INTEGER,
    3
  ),
  includes_rental = TRUE,
  package_type = CASE 
    WHEN name ~* 'stay|accommodation' THEN 'lesson_rental'
    ELSE 'rental'
  END
WHERE (
  name ~* 'rental'
  OR includes_rental = TRUE
)
AND (rental_days IS NULL OR rental_days = 0);

UPDATE service_packages
SET 
  accommodation_nights = COALESCE(
    NULLIF(
      (regexp_match(name, '(\d+)\s*days?\s*stay', 'i'))[1],
      ''
    )::INTEGER,
    NULLIF(
      (regexp_match(name, '(\d+)\s*nights?', 'i'))[1],
      ''
    )::INTEGER,
    3
  ),
  includes_accommodation = TRUE,
  package_type = CASE 
    WHEN name ~* 'rental' THEN 'accommodation_rental'
    WHEN name ~* 'lesson|private|group|pack' THEN 'accommodation_lesson'
    ELSE 'accommodation'
  END
WHERE (
  name ~* 'stay|accommodation|nights?'
  OR includes_accommodation = TRUE
)
AND (accommodation_nights IS NULL OR accommodation_nights = 0);

-- Add comments
COMMENT ON TABLE customer_packages IS 'Customer purchased packages with proper tracking for lessons, rentals, and accommodations';
