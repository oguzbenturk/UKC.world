-- Migration 250: Kai conversation flags for admin review
-- Allows admins to flag/annotate Kai conversations for review

CREATE TABLE IF NOT EXISTS kai_conversation_flags (
  id            SERIAL PRIMARY KEY,
  session_id    TEXT NOT NULL,
  flagged_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_type     VARCHAR(20) NOT NULL DEFAULT 'review',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_flag_type CHECK (flag_type IN ('review', 'escalation', 'error', 'praise'))
);

CREATE INDEX IF NOT EXISTS idx_kai_flags_session ON kai_conversation_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_kai_flags_type ON kai_conversation_flags(flag_type);
