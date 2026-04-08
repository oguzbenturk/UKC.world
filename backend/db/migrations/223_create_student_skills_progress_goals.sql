-- Migration 223: Create skill_levels, skills, student_progress, student_goals tables

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Skill levels (Beginner → Expert)
CREATE TABLE IF NOT EXISTS skill_levels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(64)  NOT NULL UNIQUE,
  description TEXT,
  order_index INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_levels_order ON skill_levels(order_index);

-- 2. Skills (linked to a level)
CREATE TABLE IF NOT EXISTS skills (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(128) NOT NULL UNIQUE,
  description    TEXT,
  skill_level_id UUID REFERENCES skill_levels(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_level ON skills(skill_level_id);

-- 3. Student progress (instructor records achieved skills)
CREATE TABLE IF NOT EXISTS student_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id      UUID REFERENCES skills(id) ON DELETE SET NULL,
  instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  date_achieved DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_progress_student    ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_instructor ON student_progress(instructor_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_skill      ON student_progress(skill_id);

-- 4. Student goals (instructor sets goals with students)
CREATE TABLE IF NOT EXISTS student_goals (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(256) NOT NULL,
  description   TEXT,
  target_date   DATE,
  status        VARCHAR(32) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'achieved', 'cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_goals_student    ON student_goals(student_id);
CREATE INDEX IF NOT EXISTS idx_student_goals_instructor ON student_goals(instructor_id);
CREATE INDEX IF NOT EXISTS idx_student_goals_status     ON student_goals(status);

-- Seed skill levels
INSERT INTO skill_levels (name, description, order_index) VALUES
  ('Beginner',     'No prior experience required',            1),
  ('Intermediate', 'Basic water skills established',          2),
  ('Advanced',     'Confident rider progressing techniques',  3),
  ('Expert',       'High performance and freestyle skills',   4)
ON CONFLICT (name) DO NOTHING;

-- Ensure unique constraint exists on skills.name (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'skills'::regclass AND contype = 'u'
    AND conname = 'skills_name_key'
  ) THEN
    ALTER TABLE skills ADD CONSTRAINT skills_name_key UNIQUE (name);
  END IF;
END $$;

-- Seed skills (referenced by level name for readability)
INSERT INTO skills (name, description, skill_level_id)
SELECT s.name, s.description, sl.id
FROM (VALUES
  ('Kite Control',    'Control kite in the power zone',          'Beginner'),
  ('Body Dragging',   'Use kite power to drag through water',    'Beginner'),
  ('Water Start',     'Getting up on the board from water',      'Intermediate'),
  ('Board Riding',    'Maintaining direction on board',          'Intermediate'),
  ('Upwind Riding',   'Riding upwind to return to start point',  'Advanced'),
  ('Jumping',         'Basic kite-assisted jumps',               'Advanced'),
  ('Transitions',     'Smooth direction changes / tacks / gybes','Advanced'),
  ('Kite Loop',       'Looping the kite during a jump',          'Expert')
) AS s(name, description, level_name)
JOIN skill_levels sl ON sl.name = s.level_name
ON CONFLICT (name) DO NOTHING;
