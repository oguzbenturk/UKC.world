-- Migration: Spotify integration tables
-- Date: 2026-05-30
-- Description: Stores Spotify OAuth tokens (single business account) and per-user scheduled playback rules.

CREATE TABLE IF NOT EXISTS spotify_tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  spotify_user_id VARCHAR(255),
  display_name VARCHAR(255),
  email VARCHAR(255),
  product VARCHAR(64),
  avatar_url TEXT,
  linked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS spotify_tokens_singleton_idx
  ON spotify_tokens ((TRUE));

CREATE TABLE IF NOT EXISTS spotify_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  playlist_uri TEXT NOT NULL,
  playlist_name VARCHAR(255),
  device_id TEXT,
  device_name VARCHAR(255),
  scheduled_time VARCHAR(5) NOT NULL,
  repeat_mode VARCHAR(20) NOT NULL DEFAULT 'once'
    CHECK (repeat_mode IN ('once', 'daily', 'weekdays', 'weekends')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spotify_schedules_user_idx
  ON spotify_schedules(user_id) WHERE is_active = TRUE;
