-- Migration 195: Add per-component rate columns to service_packages
-- These store the per-unit pricing set when creating combo/all-inclusive packages:
--   package_hourly_rate  = lesson price per hour (e.g., €65/h)
--   package_daily_rate   = rental price per day (e.g., €55/day)
--   package_nightly_rate = accommodation price per night (e.g., €120/night)
-- The total package price = (hourly * hours) + (daily * days) + (nightly * nights)

ALTER TABLE service_packages
ADD COLUMN IF NOT EXISTS package_hourly_rate NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS package_daily_rate NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS package_nightly_rate NUMERIC(10,2);

-- Backfill existing packages by deriving rates from linked services/accommodation units
-- Lesson hourly rate: from the linked lesson service
UPDATE service_packages sp
SET package_hourly_rate = s.price
FROM services s
WHERE sp.lesson_service_id = s.id
  AND sp.package_hourly_rate IS NULL
  AND sp.includes_lessons = TRUE
  AND s.price > 0;

-- Rental daily rate: from the linked rental service
UPDATE service_packages sp
SET package_daily_rate = s.price
FROM services s
WHERE sp.rental_service_id = s.id
  AND sp.package_daily_rate IS NULL
  AND sp.includes_rental = TRUE
  AND s.price > 0;

-- Accommodation nightly rate: from the linked accommodation unit
UPDATE service_packages sp
SET package_nightly_rate = au.price_per_night
FROM accommodation_units au
WHERE sp.accommodation_unit_id = au.id
  AND sp.package_nightly_rate IS NULL
  AND sp.includes_accommodation = TRUE
  AND au.price_per_night > 0;

COMMENT ON COLUMN service_packages.package_hourly_rate IS 'Per-hour lesson rate set during package creation (may differ from standalone service price)';
COMMENT ON COLUMN service_packages.package_daily_rate IS 'Per-day rental rate set during package creation';
COMMENT ON COLUMN service_packages.package_nightly_rate IS 'Per-night accommodation rate set during package creation';
