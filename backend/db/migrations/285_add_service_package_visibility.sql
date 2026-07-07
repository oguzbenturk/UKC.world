-- Add is_visible to services and service_packages so individual lesson services
-- and packages can be hidden from the customer-facing Academy pages while
-- remaining fully usable and assignable by staff.
--
-- Mirrors products.is_visible (migration 277): visibility is a display concern,
-- independent of the active/scheduled lifecycle. All existing rows backfill to
-- true via the NOT NULL DEFAULT, so nothing changes until something is hidden.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE service_packages
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN services.is_visible IS
  'When false, the service is hidden from customer-facing Academy pages but stays staff-visible and assignable.';
COMMENT ON COLUMN service_packages.is_visible IS
  'When false, the package is hidden from customer-facing Academy pages but stays staff-visible and assignable.';

-- Partial indexes keep the customer-facing "visible only" scans fast.
CREATE INDEX IF NOT EXISTS idx_services_visible ON services (is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_service_packages_visible ON service_packages (is_visible) WHERE is_visible = true;
