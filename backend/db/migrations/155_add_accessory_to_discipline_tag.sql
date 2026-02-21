-- Add 'accessory' to the discipline_tag CHECK constraint on services and service_packages.
-- The original constraint (migration 149) only had: kite, wing, kite_foil, efoil, premium.
-- Rental accessory services (e.g. Wetsuit & Harness) need discipline_tag = 'accessory'.

-- 1) services table
ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_discipline_tag;
ALTER TABLE services
  ADD CONSTRAINT chk_services_discipline_tag
  CHECK (
    discipline_tag IS NULL OR
    discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium', 'accessory')
  );

-- 2) service_packages table
ALTER TABLE service_packages DROP CONSTRAINT IF EXISTS chk_service_packages_discipline_tag;
ALTER TABLE service_packages
  ADD CONSTRAINT chk_service_packages_discipline_tag
  CHECK (
    discipline_tag IS NULL OR
    discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium', 'accessory')
  );
