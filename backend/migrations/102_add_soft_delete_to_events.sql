-- 102_add_soft_delete_to_events.sql
-- Adds soft delete functionality to events table

BEGIN;

-- Add deleted_at column for soft delete
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for better query performance when filtering deleted events
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at);

-- Add image_url column if it doesn't exist (for event images)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

COMMIT;
