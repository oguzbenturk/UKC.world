-- Ensure discipline/tag columns exist and enforce valid values for lesson filtering

-- 1) Ensure required columns exist on services
ALTER TABLE IF EXISTS services
  ADD COLUMN IF NOT EXISTS discipline_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lesson_category_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS level_tag VARCHAR(32);

-- 2) Ensure required columns exist on service_packages
ALTER TABLE IF EXISTS service_packages
  ADD COLUMN IF NOT EXISTS discipline_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lesson_category_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS level_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS package_type VARCHAR(32) DEFAULT 'lesson';

-- 3) Normalize existing values
UPDATE services
SET discipline_tag = LOWER(TRIM(discipline_tag))
WHERE discipline_tag IS NOT NULL;

UPDATE service_packages
SET discipline_tag = LOWER(TRIM(discipline_tag))
WHERE discipline_tag IS NOT NULL;

UPDATE services
SET discipline_tag = 'kite_foil'
WHERE discipline_tag = 'foil';

UPDATE service_packages
SET discipline_tag = 'kite_foil'
WHERE discipline_tag = 'foil';

UPDATE services
SET lesson_category_tag = LOWER(TRIM(lesson_category_tag))
WHERE lesson_category_tag IS NOT NULL;

UPDATE service_packages
SET lesson_category_tag = LOWER(TRIM(lesson_category_tag))
WHERE lesson_category_tag IS NOT NULL;

-- 4) Add constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_services_discipline_tag') THEN
    ALTER TABLE services
      ADD CONSTRAINT chk_services_discipline_tag
      CHECK (
        discipline_tag IS NULL OR
        discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_service_packages_discipline_tag') THEN
    ALTER TABLE service_packages
      ADD CONSTRAINT chk_service_packages_discipline_tag
      CHECK (
        discipline_tag IS NULL OR
        discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_services_lesson_category_tag') THEN
    ALTER TABLE services
      ADD CONSTRAINT chk_services_lesson_category_tag
      CHECK (
        lesson_category_tag IS NULL OR
        lesson_category_tag IN ('private', 'semi-private', 'semi private', 'group', 'supervision')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_service_packages_lesson_category_tag') THEN
    ALTER TABLE service_packages
      ADD CONSTRAINT chk_service_packages_lesson_category_tag
      CHECK (
        lesson_category_tag IS NULL OR
        lesson_category_tag IN ('private', 'semi-private', 'semi private', 'group', 'supervision')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_service_packages_package_type') THEN
    ALTER TABLE service_packages
      ADD CONSTRAINT chk_service_packages_package_type
      CHECK (
        package_type IS NULL OR
        package_type IN (
          'lesson',
          'rental',
          'accommodation',
          'lesson_rental',
          'accommodation_lesson',
          'accommodation_rental',
          'all_inclusive'
        )
      );
  END IF;
END $$;

-- 5) Helpful indexes for admin tabs and public filtering
CREATE INDEX IF NOT EXISTS idx_services_discipline_tag ON services(discipline_tag);
CREATE INDEX IF NOT EXISTS idx_services_lesson_category_tag ON services(lesson_category_tag);
CREATE INDEX IF NOT EXISTS idx_service_packages_discipline_tag ON service_packages(discipline_tag);
CREATE INDEX IF NOT EXISTS idx_service_packages_lesson_category_tag ON service_packages(lesson_category_tag);
CREATE INDEX IF NOT EXISTS idx_service_packages_package_type ON service_packages(package_type);
