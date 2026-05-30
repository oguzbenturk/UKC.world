-- Migration: Family groups (adult peer-linked customer accounts)
-- Date: 2026-05-31
-- Description: Lets staff manually link adult customer accounts into a "family".
-- One member is the Organizer who can see other members' profiles from the navbar.
-- Distinct from the existing `family_members` table (which models minor children of a parent).

CREATE TABLE IF NOT EXISTS family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120),
  organizer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS family_group_members (
  group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS family_group_members_user_idx
  ON family_group_members(user_id);

CREATE INDEX IF NOT EXISTS family_groups_organizer_idx
  ON family_groups(organizer_user_id) WHERE deleted_at IS NULL;
