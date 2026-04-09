-- 234_create_team_settings.sql
-- Team page configuration tables

CREATE TABLE IF NOT EXISTS team_member_settings (
  id SERIAL PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  custom_bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id)
);

CREATE TABLE IF NOT EXISTS team_global_settings (
  id SERIAL PRIMARY KEY,
  visible_fields JSONB NOT NULL DEFAULT '["bio","specializations","languages","experience"]'::jsonb,
  booking_link_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed one default global settings row
INSERT INTO team_global_settings (visible_fields, booking_link_enabled)
VALUES ('["bio","specializations","languages","experience"]'::jsonb, true)
ON CONFLICT DO NOTHING;

CREATE INDEX idx_team_member_settings_instructor ON team_member_settings(instructor_id);
