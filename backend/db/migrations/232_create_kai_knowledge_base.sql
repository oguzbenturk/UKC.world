-- Knowledge base for Kai AI assistant
-- Stores FAQ, pricing, policies etc. that get injected into the system prompt
-- to reduce tool calls for common questions.

CREATE TABLE IF NOT EXISTS kai_knowledge_base (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         VARCHAR(100)    NOT NULL,
  title            VARCHAR(255)    NOT NULL,
  content          TEXT            NOT NULL,
  applicable_roles VARCHAR(20)[]   NOT NULL DEFAULT '{outsider,student,instructor,admin,manager}',
  sort_order       INTEGER         NOT NULL DEFAULT 0,
  is_active        BOOLEAN         NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_active ON kai_knowledge_base(is_active) WHERE is_active = true;

-- Add KB caching columns to kai_sessions
ALTER TABLE kai_sessions ADD COLUMN IF NOT EXISTS kb_snapshot TEXT;
ALTER TABLE kai_sessions ADD COLUMN IF NOT EXISTS kb_fetched_at TIMESTAMPTZ;
