-- Migration 134: Create form_quick_action_tokens table for email quick actions
-- Stores secure tokens for approve/reject links in admin emails
-- Tokens expire after 72 hours and can only be used once

CREATE TABLE IF NOT EXISTS form_quick_action_tokens (
  id SERIAL PRIMARY KEY,
  form_submission_id INTEGER NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject')),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  used_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(form_submission_id, action)
);

-- Index for quick token lookup
CREATE INDEX IF NOT EXISTS idx_form_quick_action_tokens_token 
ON form_quick_action_tokens(token) WHERE used_at IS NULL;

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_form_quick_action_tokens_expires 
ON form_quick_action_tokens(expires_at) WHERE used_at IS NULL;

-- Index for submission lookup
CREATE INDEX IF NOT EXISTS idx_form_quick_action_tokens_submission 
ON form_quick_action_tokens(form_submission_id);

COMMENT ON TABLE form_quick_action_tokens IS 'Secure tokens for one-click approve/reject actions in admin emails';
COMMENT ON COLUMN form_quick_action_tokens.token IS '64-character secure random token';
COMMENT ON COLUMN form_quick_action_tokens.action IS 'Action type: approve or reject';
COMMENT ON COLUMN form_quick_action_tokens.expires_at IS 'Token expiration timestamp (typically 72 hours)';
COMMENT ON COLUMN form_quick_action_tokens.used_at IS 'When the token was used (null if unused)';
COMMENT ON COLUMN form_quick_action_tokens.used_by IS 'User who used the token (may be null for unauthenticated access)';
