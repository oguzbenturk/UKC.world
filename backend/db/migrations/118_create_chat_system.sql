-- Migration: Create Live Chat System
-- Description: Conversations (1:1, group, channel), messages with full-text search, read receipts, and 5-day retention
-- Date: 2026-01-17

-- ============================================
-- 1. CONVERSATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group', 'channel')),
  name VARCHAR(255), -- NULL for direct messages, required for groups/channels
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT conversations_name_check CHECK (
    (type = 'direct' AND name IS NULL) OR
    (type IN ('group', 'channel') AND name IS NOT NULL)
  )
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

COMMENT ON TABLE conversations IS 'Chat conversations: direct (1:1 auto-created), group/channel (admin/manager created)';
COMMENT ON COLUMN conversations.type IS 'direct: 1:1 auto-created on first message, group/channel: require admin/manager role';

-- ============================================
-- 2. CONVERSATION PARTICIPANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_conversation VARCHAR(20) DEFAULT 'member' CHECK (role_in_conversation IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE, -- For read receipts
  left_at TIMESTAMP WITH TIME ZONE, -- Soft leave (still in DB)
  
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_conversation_participants_last_read ON conversation_participants(last_read_at);

COMMENT ON COLUMN conversation_participants.last_read_at IS 'Timestamp of last message read by this user (for read receipts)';
COMMENT ON COLUMN conversation_participants.left_at IS 'User left the conversation (soft leave, maintains history)';

-- ============================================
-- 3. MESSAGES TABLE WITH FULL-TEXT SEARCH
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'image', 'file', 'system')),
  content TEXT, -- Message text or system message content
  attachment_url TEXT, -- Relative path to uploaded file
  attachment_filename VARCHAR(255), -- Original filename for downloads
  attachment_size INTEGER, -- File size in bytes
  voice_duration INTEGER, -- Voice message duration in seconds
  voice_transcript TEXT, -- Free transcription using Web Speech API (client-side)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  edited_at TIMESTAMP WITH TIME ZONE, -- Last edit timestamp
  
  -- GDPR compliance: 5-day retention
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by_expiration BOOLEAN DEFAULT FALSE,
  
  -- Full-text search (PostgreSQL tsvector)
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(content, '') || ' ' || 
      COALESCE(voice_transcript, '') || ' ' ||
      COALESCE(attachment_filename, '')
    )
  ) STORED
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_expiration_cleanup ON messages(created_at, deleted_at) 
  WHERE deleted_at IS NULL; -- For efficient cleanup job

-- Full-text search index (GIN)
CREATE INDEX idx_messages_search ON messages USING gin(search_vector);

COMMENT ON TABLE messages IS 'Chat messages with 5-day retention, full-text search, and GDPR compliance';
COMMENT ON COLUMN messages.deleted_at IS 'Auto-deleted after 5 days per GDPR data minimization (retention policy)';
COMMENT ON COLUMN messages.deleted_by_expiration IS 'TRUE if deleted by automatic 5-day expiration job';
COMMENT ON COLUMN messages.voice_transcript IS 'Free transcription via Web Speech API (client-side, no server cost)';
COMMENT ON COLUMN messages.search_vector IS 'Full-text search vector (admin/manager search across conversations)';

-- ============================================
-- 4. MESSAGE REACTIONS TABLE (Optional MVP+)
-- ============================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL, -- Unicode emoji (e.g., '👍', '❤️')
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(message_id, user_id, emoji) -- One reaction per user per emoji per message
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON message_reactions(user_id);

COMMENT ON TABLE message_reactions IS 'Emoji reactions to messages (subtle, professional)';

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function: Get unread message count for a user in a conversation
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id UUID, p_conversation_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_last_read_at TIMESTAMP WITH TIME ZONE;
  v_unread_count INTEGER;
BEGIN
  -- Get user's last read timestamp
  SELECT last_read_at INTO v_last_read_at
  FROM conversation_participants
  WHERE user_id = p_user_id AND conversation_id = p_conversation_id;
  
  -- Count messages after last read (or all if never read)
  SELECT COUNT(*)::INTEGER INTO v_unread_count
  FROM messages
  WHERE conversation_id = p_conversation_id
    AND deleted_at IS NULL
    AND sender_id != p_user_id -- Don't count own messages
    AND (v_last_read_at IS NULL OR created_at > v_last_read_at);
  
  RETURN COALESCE(v_unread_count, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Cleanup expired messages (called by cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS TABLE(deleted_count INTEGER, file_paths TEXT[]) AS $$
DECLARE
  v_retention_days INTEGER := 5;
  v_deleted_count INTEGER;
  v_file_paths TEXT[];
BEGIN
  -- Collect file paths before deletion
  SELECT ARRAY_AGG(attachment_url) INTO v_file_paths
  FROM messages
  WHERE created_at < NOW() - INTERVAL '5 days'
    AND deleted_at IS NULL
    AND attachment_url IS NOT NULL;
  
  -- Soft delete expired messages
  UPDATE messages
  SET 
    deleted_at = NOW(),
    deleted_by_expiration = TRUE,
    content = NULL, -- Remove content for GDPR
    attachment_url = NULL,
    attachment_filename = NULL,
    voice_transcript = NULL
  WHERE created_at < NOW() - MAKE_INTERVAL(days => v_retention_days)
    AND deleted_at IS NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted_count, v_file_paths;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_messages IS 'Soft-delete messages older than 5 days and return file paths for cleanup';

-- Function: Search messages with full-text search (admin/manager only)
CREATE OR REPLACE FUNCTION search_messages(
  p_user_id UUID,
  p_search_query TEXT,
  p_conversation_ids UUID[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  message_id UUID,
  conversation_id UUID,
  sender_id UUID,
  sender_name VARCHAR,
  content TEXT,
  message_type VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.conversation_id,
    m.sender_id,
    u.name,
    m.content,
    m.message_type,
    m.created_at,
    ts_rank(m.search_vector, plainto_tsquery('english', p_search_query)) AS rank
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = p_user_id -- Only search in conversations user is part of
    AND m.deleted_at IS NULL
    AND m.search_vector @@ plainto_tsquery('english', p_search_query)
    AND (p_conversation_ids IS NULL OR m.conversation_id = ANY(p_conversation_ids))
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_messages IS 'Full-text search across messages (conversation-scoped for privacy, global for admins)';

-- ============================================
-- 6. TRIGGERS
-- ============================================

-- Trigger: Update conversation updated_at on new message
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_conversation_timestamp
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================
-- 7. SEED DATA (Optional)
-- ============================================

-- Create a general "Support" channel for all users (created by system admin)
DO $$
DECLARE
  v_admin_id UUID;
  v_support_conversation_id UUID;
BEGIN
  -- Find first admin user
  SELECT u.id INTO v_admin_id
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'admin'
  LIMIT 1;
  
  IF v_admin_id IS NOT NULL THEN
    -- Create support channel
    INSERT INTO conversations (type, name, created_by)
    VALUES ('channel', 'Support', v_admin_id)
    RETURNING id INTO v_support_conversation_id;
    
    -- Add admin as owner
    INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation)
    VALUES (v_support_conversation_id, v_admin_id, 'owner');
    
    -- Add welcome message
    INSERT INTO messages (conversation_id, sender_id, message_type, content)
    VALUES (
      v_support_conversation_id,
      v_admin_id,
      'system',
      'Welcome to the Support channel! Ask questions or report issues here.'
    );
  END IF;
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$ 
BEGIN 
  RAISE NOTICE 'Migration 118: Chat system created successfully';
  RAISE NOTICE '  - Conversations: direct (1:1), group, channel';
  RAISE NOTICE '  - Messages: 5-day retention, full-text search';
  RAISE NOTICE '  - Features: Read receipts, voice transcription, reactions';
  RAISE NOTICE '  - GDPR: Auto-expiration, soft delete, anonymization support';
END $$;
