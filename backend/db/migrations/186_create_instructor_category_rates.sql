-- Migration 186: Create instructor category rates table
-- Allows configuring fixed hourly rates (or percentage) per lesson category
-- (private, group, supervision, semi-private) per instructor.
-- These rates sit between service-specific and default commissions in priority.

CREATE TABLE IF NOT EXISTS instructor_category_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_category VARCHAR(32) NOT NULL,
  rate_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  rate_value DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instructor_id, lesson_category),
  CHECK (lesson_category IN ('private', 'semi-private', 'group', 'supervision')),
  CHECK (rate_type IN ('fixed', 'percentage'))
);

CREATE INDEX IF NOT EXISTS idx_instructor_category_rates_instructor
  ON instructor_category_rates(instructor_id);

CREATE INDEX IF NOT EXISTS idx_instructor_category_rates_category
  ON instructor_category_rates(lesson_category);
