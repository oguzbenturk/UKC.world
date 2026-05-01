-- Migration 251: Add 'semi-private-supervision' lesson category
-- Allows distinguishing supervision of 1 student (existing 'supervision')
-- from supervision of 2-4 students (new 'semi-private-supervision'),
-- so instructors can have a distinct commission rate for each.

-- 1) instructor_category_rates: replace anonymous CHECK with named one allowing the new value
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_instructor_category_rates_lesson_category'
  ) THEN
    ALTER TABLE instructor_category_rates
      ADD CONSTRAINT chk_instructor_category_rates_lesson_category
      CHECK (lesson_category IN (
        'private', 'semi-private', 'group', 'supervision', 'semi-private-supervision'
      ));
  END IF;
END $$;

-- 2) services.lesson_category_tag: drop and recreate constraint with the new value
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_services_lesson_category_tag'
  ) THEN
    ALTER TABLE services DROP CONSTRAINT chk_services_lesson_category_tag;
  END IF;

  ALTER TABLE services
    ADD CONSTRAINT chk_services_lesson_category_tag
    CHECK (
      lesson_category_tag IS NULL OR
      lesson_category_tag IN (
        'private', 'semi-private', 'semi private', 'group', 'supervision', 'semi-private-supervision'
      )
    );
END $$;

-- 3) service_packages.lesson_category_tag: same treatment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_service_packages_lesson_category_tag'
  ) THEN
    ALTER TABLE service_packages DROP CONSTRAINT chk_service_packages_lesson_category_tag;
  END IF;

  ALTER TABLE service_packages
    ADD CONSTRAINT chk_service_packages_lesson_category_tag
    CHECK (
      lesson_category_tag IS NULL OR
      lesson_category_tag IN (
        'private', 'semi-private', 'semi private', 'group', 'supervision', 'semi-private-supervision'
      )
    );
END $$;
