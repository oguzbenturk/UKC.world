-- Migration 187: Create instructor_skills table
-- Maps instructors to disciplines they are qualified to teach,
-- with allowed lesson categories and maximum student level per discipline.

CREATE TABLE IF NOT EXISTS instructor_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_tag VARCHAR(32) NOT NULL,
  lesson_categories TEXT[] NOT NULL DEFAULT '{}',
  max_level VARCHAR(32) NOT NULL DEFAULT 'beginner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instructor_id, discipline_tag),
  CHECK (discipline_tag IN ('kite', 'wing', 'kite_foil', 'efoil', 'premium')),
  CHECK (max_level IN ('beginner', 'intermediate', 'advanced'))
);

CREATE INDEX IF NOT EXISTS idx_instructor_skills_instructor
  ON instructor_skills(instructor_id);

CREATE INDEX IF NOT EXISTS idx_instructor_skills_discipline
  ON instructor_skills(discipline_tag);

-- Seed initial skills from existing instructor_services assignments.
-- For each instructor–discipline pair found via their assigned services,
-- create a skill row granting all lesson categories at advanced level.
INSERT INTO instructor_skills (instructor_id, discipline_tag, lesson_categories, max_level)
SELECT DISTINCT
  ins.instructor_id,
  s.discipline_tag,
  ARRAY['private', 'semi-private', 'group', 'supervision'],
  'advanced'
FROM instructor_services ins
JOIN services s ON s.id = ins.service_id
WHERE s.discipline_tag IS NOT NULL
  AND s.discipline_tag != ''
ON CONFLICT (instructor_id, discipline_tag) DO NOTHING;
