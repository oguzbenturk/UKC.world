-- 116_create_user_relationships.sql
-- Create user relationships (friends/connections) system for group bookings
-- Users must be connected to invite each other to group lessons

CREATE TABLE IF NOT EXISTS user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The user who initiated the friend request
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- The user who received the friend request
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status of the relationship
  status VARCHAR(20) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  
  -- Optional message when sending request
  message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  
  -- Ensure unique relationship between two users (only one direction matters)
  CONSTRAINT unique_relationship UNIQUE (sender_id, receiver_id),
  
  -- Prevent self-relationships
  CONSTRAINT no_self_relationship CHECK (sender_id != receiver_id)
);

-- Index for looking up relationships by sender
CREATE INDEX IF NOT EXISTS idx_user_relationships_sender 
  ON user_relationships(sender_id);

-- Index for looking up relationships by receiver  
CREATE INDEX IF NOT EXISTS idx_user_relationships_receiver 
  ON user_relationships(receiver_id);

-- Index for finding accepted connections
CREATE INDEX IF NOT EXISTS idx_user_relationships_accepted 
  ON user_relationships(status) WHERE status = 'accepted';

-- Composite index for efficient friend lookup (accepted relationships only)
CREATE INDEX IF NOT EXISTS idx_user_relationships_friends_sender 
  ON user_relationships(sender_id, receiver_id) WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_user_relationships_friends_receiver 
  ON user_relationships(receiver_id, sender_id) WHERE status = 'accepted';

-- Add comment explaining the table
COMMENT ON TABLE user_relationships IS 
  'Stores friend/connection relationships between users for group booking invitations';

COMMENT ON COLUMN user_relationships.status IS 
  'pending = awaiting acceptance, accepted = friends, declined = request rejected, blocked = user blocked';
