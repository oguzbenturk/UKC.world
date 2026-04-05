-- 010_create_student_support_requests.sql
-- Adds dedicated table for tracking inbound support requests submitted from the student portal.

BEGIN;

CREATE TABLE IF NOT EXISTS student_support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'portal', -- portal | email | chat
  priority VARCHAR(16) NOT NULL DEFAULT 'normal', -- low | normal | high | urgent
  status VARCHAR(16) NOT NULL DEFAULT 'open', -- open | in_progress | resolved | closed
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_support_requests_student_id
  ON student_support_requests(student_id);

CREATE INDEX IF NOT EXISTS idx_student_support_requests_status
  ON student_support_requests(status);

COMMIT;
