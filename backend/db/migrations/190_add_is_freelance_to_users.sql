-- Add is_freelance flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_freelance BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN users.is_freelance IS 'Whether the instructor is freelance (not prioritized for lesson assignments)';
