-- Migration: Add soft delete support to users table
-- This allows users to be soft-deleted while enabling re-registration with the same email

-- Add deleted_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_by column to track who deleted the user
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add original_email column to preserve email before anonymization (for audit purposes)
ALTER TABLE users ADD COLUMN IF NOT EXISTS original_email VARCHAR(255) DEFAULT NULL;

-- Create index for efficient queries on non-deleted users
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- Create partial index for email uniqueness only on non-deleted users
-- First, drop the existing unique constraint on email if it exists
DO $$
BEGIN
    -- Try to drop the unique constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_email_key' 
        AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_email_key;
    END IF;
END $$;

-- Create a partial unique index that only applies to non-deleted users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_active 
ON users(email) 
WHERE deleted_at IS NULL;

-- Comment explaining the soft delete behavior
COMMENT ON COLUMN users.deleted_at IS 'Timestamp when user was soft deleted. NULL means user is active.';
COMMENT ON COLUMN users.deleted_by IS 'UUID of admin who deleted this user';
COMMENT ON COLUMN users.original_email IS 'Preserved email before anonymization for audit purposes';
