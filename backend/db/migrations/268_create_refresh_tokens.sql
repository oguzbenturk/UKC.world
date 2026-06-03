-- Migration: Refresh tokens for long-lived sessions (always-on music kiosk)
-- Date: 2026-06-02
-- Description: Server-side, rotating refresh-token store so the short access JWT
-- (kept at TOKEN_EXPIRY for SEC-008) can be silently renewed without re-login.
-- Each login starts a token "family"; rotation + reuse-detection contains theft.
-- This is what lets the always-on /music screen stay logged in past the 2h token life.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,
  token_hash  TEXT NOT NULL,            -- SHA-256 of the raw token; raw value is never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  rotated_at  TIMESTAMPTZ,             -- set when this token is exchanged for a new one
  revoked_at  TIMESTAMPTZ,             -- set on logout or reuse-detection (whole family)
  replaced_by UUID,                    -- audit chain: the token issued in its place
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens(expires_at);
