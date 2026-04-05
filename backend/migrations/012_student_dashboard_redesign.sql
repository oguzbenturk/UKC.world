-- 012_student_dashboard_redesign.sql
-- Creates supporting tables for the redesigned student dashboard experience.

BEGIN;

-- Recommended products allow admins to curate catalog items for students/instructors
CREATE TABLE IF NOT EXISTS recommended_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recommended_for_role VARCHAR(32) NOT NULL DEFAULT 'student', -- student | instructor | all
  priority SMALLINT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommended_products_unique_role
  ON recommended_products(product_id, recommended_for_role);

CREATE INDEX IF NOT EXISTS idx_recommended_products_priority
  ON recommended_products(priority DESC, created_at DESC);

-- Ratings that students leave after a lesson / rental / accommodation
CREATE TABLE IF NOT EXISTS instructor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type VARCHAR(32) NOT NULL DEFAULT 'lesson', -- lesson | rental | accommodation
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback_text TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_ratings_instructor_id
  ON instructor_ratings(instructor_id);

CREATE INDEX IF NOT EXISTS idx_instructor_ratings_student_id
  ON instructor_ratings(student_id);

CREATE INDEX IF NOT EXISTS idx_instructor_ratings_created_at
  ON instructor_ratings(created_at DESC);

-- Instructor-authored notes that can optionally be exposed to the student
CREATE TABLE IF NOT EXISTS instructor_student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  note_text TEXT NOT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'student_visible', -- student_visible | instructor_only
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_student_notes_student_id
  ON instructor_student_notes(student_id);

CREATE INDEX IF NOT EXISTS idx_instructor_student_notes_instructor_id
  ON instructor_student_notes(instructor_id);

CREATE INDEX IF NOT EXISTS idx_instructor_student_notes_booking_id
  ON instructor_student_notes(booking_id);

COMMIT;
