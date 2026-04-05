-- Add rental_segment column to categorise rental services by equipment class
-- (SLS, D/LAB, Standard, Board, Accessory)
-- Also broadens discipline_tag constraint to use an ALTER + DROP/RE-ADD pattern
-- so rental services can also carry the existing discipline tags.

-- 1) Add rental_segment column if missing
ALTER TABLE IF EXISTS services
  ADD COLUMN IF NOT EXISTS rental_segment VARCHAR(32);

-- 2) Back-fill rental_segment from the service name for existing data
--    Rules mirror what the JS getRentalSegmentsForService helper inferred.
UPDATE services
SET rental_segment = CASE
  WHEN name ~* '\bSLS\b'                                          THEN 'sls'
  WHEN name ~* '\bD[\s-]?LAB\b'                                  THEN 'dlab'
  WHEN name ~* '\b(board|twintip|twin tip|directional|surfboard)\b' THEN 'board'
  WHEN name ~* '\b(harness|helmet|wetsuit|pump|bag|vest|glove|bootie|bar)\b' THEN 'accessory'
  ELSE 'standard'
END
WHERE category = 'rental' AND rental_segment IS NULL;

-- 3) Add CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_services_rental_segment'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT chk_services_rental_segment
      CHECK (
        rental_segment IS NULL OR
        rental_segment IN ('sls', 'dlab', 'standard', 'board', 'accessory')
      );
  END IF;
END $$;
