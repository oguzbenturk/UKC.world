-- Migration: Create repair_request_comments table
-- Description: Enable chat/messaging between customer and admin for repair requests

CREATE TABLE IF NOT EXISTS repair_request_comments (
  id SERIAL PRIMARY KEY,
  repair_request_id INTEGER NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- For admin-only internal notes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repair_comments_request ON repair_request_comments(repair_request_id);
CREATE INDEX idx_repair_comments_user ON repair_request_comments(user_id);
CREATE INDEX idx_repair_comments_created ON repair_request_comments(created_at DESC);

-- Add comment to describe the table
COMMENT ON TABLE repair_request_comments IS 'Chat messages between customers and admins for repair requests';
COMMENT ON COLUMN repair_request_comments.is_internal IS 'If true, only visible to admin/manager, not to the customer';
