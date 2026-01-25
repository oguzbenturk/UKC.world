-- Migration 135: Add 'view' action to form_quick_action_tokens
-- Extends quick action tokens to support view-only submission links in confirmation emails
-- View tokens have longer expiration (30 days) and can be used multiple times

-- Remove the existing CHECK constraint
ALTER TABLE form_quick_action_tokens 
DROP CONSTRAINT IF EXISTS form_quick_action_tokens_action_check;

-- Add new CHECK constraint with 'view' action
ALTER TABLE form_quick_action_tokens 
ADD CONSTRAINT form_quick_action_tokens_action_check 
CHECK (action IN ('approve', 'reject', 'view'));

-- Remove UNIQUE constraint for submission_id + action to allow multiple views
ALTER TABLE form_quick_action_tokens
DROP CONSTRAINT IF EXISTS form_quick_action_tokens_form_submission_id_action_key;

-- Add partial unique index (only for approve/reject, not for view)
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_quick_action_tokens_unique_admin_actions
ON form_quick_action_tokens(form_submission_id, action)
WHERE action IN ('approve', 'reject');

COMMENT ON COLUMN form_quick_action_tokens.action IS 'Action type: approve, reject, or view';
