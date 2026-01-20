-- Migration: Ensure unique constraint on notifications.idempotency_key
-- This is required for the ON CONFLICT clause to work in insertNotification

-- Drop existing index if exists (partial indexes don't work with ON CONFLICT)
DROP INDEX IF EXISTS idx_notifications_idempotency_key;

-- Add unique constraint (this will create an implicit index)
ALTER TABLE notifications 
ADD CONSTRAINT IF NOT EXISTS notifications_idempotency_key_unique 
UNIQUE (idempotency_key);

-- Add comment
COMMENT ON CONSTRAINT notifications_idempotency_key_unique ON notifications IS 'Unique constraint for notification deduplication via idempotency keys';
