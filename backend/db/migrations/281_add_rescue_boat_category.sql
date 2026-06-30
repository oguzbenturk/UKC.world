-- Migration 281: Add the "rescue_boat" service category.
--
-- Rescue boat is sold like a lesson type (its own card, modal, packages and
-- per-segment price) but is a distinct safety service. We model it as a new
-- lesson_category_tag + discipline_tag value so it reuses the existing booking /
-- package / commission machinery. 1 rescue trip = 1 consumable unit ("hour").
--
-- Pricing: a base (non-member) price plus an automatic discount for customers
-- with an active membership. The discount percent lives on the service so it is
-- adjustable; it defaults to 50% per the owner's requirement.

-- 1) instructor_category_rates.lesson_category — allow 'rescue_boat'
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'instructor_category_rates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%lesson_category%IN%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE instructor_category_rates DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE instructor_category_rates
  ADD CONSTRAINT chk_instructor_category_rates_lesson_category
  CHECK (lesson_category IN (
    'private', 'semi-private', 'group', 'supervision', 'semi-private-supervision', 'rescue_boat'
  ));

-- 2) services.lesson_category_tag — allow 'rescue_boat'
ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_lesson_category_tag;
ALTER TABLE services
  ADD CONSTRAINT chk_services_lesson_category_tag
  CHECK (
    lesson_category_tag IS NULL OR
    lesson_category_tag IN (
      'private', 'semi-private', 'semi private', 'group', 'supervision',
      'semi-private-supervision', 'rescue_boat'
    )
  );

-- 3) service_packages.lesson_category_tag — allow 'rescue_boat'
ALTER TABLE service_packages DROP CONSTRAINT IF EXISTS chk_service_packages_lesson_category_tag;
ALTER TABLE service_packages
  ADD CONSTRAINT chk_service_packages_lesson_category_tag
  CHECK (
    lesson_category_tag IS NULL OR
    lesson_category_tag IN (
      'private', 'semi-private', 'semi private', 'group', 'supervision',
      'semi-private-supervision', 'rescue_boat'
    )
  );

-- 4) services.discipline_tag — allow 'rescue_boat'
ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_discipline_tag;
ALTER TABLE services
  ADD CONSTRAINT chk_services_discipline_tag
  CHECK (
    discipline_tag IS NULL OR
    discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium', 'accessory', 'rescue_boat')
  );

-- 5) service_packages.discipline_tag — allow 'rescue_boat'
ALTER TABLE service_packages DROP CONSTRAINT IF EXISTS chk_service_packages_discipline_tag;
ALTER TABLE service_packages
  ADD CONSTRAINT chk_service_packages_discipline_tag
  CHECK (
    discipline_tag IS NULL OR
    discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium', 'accessory', 'rescue_boat')
  );

-- 6) services.member_discount_percent — active-membership discount for rescue boat.
--    NULL means "no membership discount" (all existing non-rescue services).
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS member_discount_percent NUMERIC(5,2);

COMMENT ON COLUMN services.member_discount_percent IS
  'Percent off for customers with an active membership (used by rescue_boat). NULL = no membership discount. Owner default for rescue = 50.';
