-- Ensure service_packages has metadata columns used by API/UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_packages' AND column_name = 'total_hours'
  ) THEN
    ALTER TABLE service_packages ADD COLUMN total_hours NUMERIC(6,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_packages' AND column_name = 'lesson_service_name'
  ) THEN
    ALTER TABLE service_packages ADD COLUMN lesson_service_name VARCHAR(255);
  END IF;
END $$;

-- Backfill defaults if needed
UPDATE service_packages SET total_hours = COALESCE(total_hours, sessions_count)
WHERE total_hours IS NULL;
