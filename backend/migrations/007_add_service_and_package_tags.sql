-- Migration: 007_add_service_and_package_tags.sql
-- Purpose: Add structured tags to services and service_packages to support
--          discipline/category/level matching without parsing names.

-- Services table: add tag columns
ALTER TABLE IF EXISTS services
  ADD COLUMN IF NOT EXISTS discipline_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lesson_category_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS level_tag VARCHAR(32);

-- Service packages table: add tag columns
ALTER TABLE IF EXISTS service_packages
  ADD COLUMN IF NOT EXISTS discipline_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS lesson_category_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS level_tag VARCHAR(32);

-- Optional: basic indexes to speed up filtering (safe to be concurrent on large tables)
CREATE INDEX IF NOT EXISTS idx_services_discipline_tag ON services (discipline_tag);
CREATE INDEX IF NOT EXISTS idx_services_lesson_category_tag ON services (lesson_category_tag);
CREATE INDEX IF NOT EXISTS idx_services_level_tag ON services (level_tag);

CREATE INDEX IF NOT EXISTS idx_service_packages_discipline_tag ON service_packages (discipline_tag);
CREATE INDEX IF NOT EXISTS idx_service_packages_lesson_category_tag ON service_packages (lesson_category_tag);
CREATE INDEX IF NOT EXISTS idx_service_packages_level_tag ON service_packages (level_tag);
