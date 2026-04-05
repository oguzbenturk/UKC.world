-- Add status column to users table for tracking instructor availability
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Set all existing users to active
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Add check constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'inactive', 'on_leave'));
  END IF;
END $$;
