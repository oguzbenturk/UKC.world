-- Migration: Add guest repair request support
-- Description: Allow unauthenticated users to submit repair requests
--              without creating an account. Guest requests are identified
--              by a unique tracking token and optionally by email.

-- make user_id optional so guest requests have no linked account
ALTER TABLE repair_requests
  ALTER COLUMN user_id DROP NOT NULL;

-- guest contact info
ALTER TABLE repair_requests
  ADD COLUMN IF NOT EXISTS guest_name    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS guest_email   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS guest_phone   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(64) UNIQUE;

-- ensure every row is traceable (either by user_id or tracking_token)
ALTER TABLE repair_requests
  ADD CONSTRAINT repair_requests_owner_check
    CHECK (user_id IS NOT NULL OR tracking_token IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_repair_requests_tracking_token ON repair_requests(tracking_token);
CREATE INDEX IF NOT EXISTS idx_repair_requests_guest_email    ON repair_requests(guest_email);
