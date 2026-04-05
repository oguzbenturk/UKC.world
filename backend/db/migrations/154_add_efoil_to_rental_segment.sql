-- Migration 154: Add 'efoil' to rental_segment CHECK constraint
-- Drops and recreates the constraint to include the new efoil segment.

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_services_rental_segment'
  ) THEN
    ALTER TABLE services DROP CONSTRAINT chk_services_rental_segment;
  END IF;

  -- Recreate with efoil added
  ALTER TABLE services
    ADD CONSTRAINT chk_services_rental_segment
    CHECK (
      rental_segment IS NULL OR
      rental_segment IN ('sls', 'dlab', 'standard', 'board', 'accessory', 'efoil')
    );
END $$;
