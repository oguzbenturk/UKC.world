-- Add idempotency support to notifications table
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Ensure idempotency keys are unique when provided
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency_key
  ON notifications(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
