-- 235_create_role_specific_settings.sql
-- Role-specific settings tables: student preferences, student safety info,
-- instructor preferences, instructor working hours, and new notification columns.
-- Date: 2026-04-10

-- ============================================================
-- Table: student_preferences
-- ============================================================

CREATE TABLE IF NOT EXISTS student_preferences (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_discipline VARCHAR(50),
  preferred_lesson_type VARCHAR(50),
  preferred_duration INTEGER,  -- in minutes: 60, 90, 120, 150, 180
  preferred_time_slot VARCHAR(20),  -- morning/afternoon/evening/any
  preferred_instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  preferred_lesson_languages TEXT[] DEFAULT '{}',
  auto_assign_instructor BOOLEAN DEFAULT false,
  pay_at_center_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_preferences_user ON student_preferences(user_id);

COMMENT ON TABLE student_preferences IS 'Per-student booking and lesson preferences. One row per student user.';
COMMENT ON COLUMN student_preferences.preferred_discipline IS 'e.g. kitesurfing, windsurfing, SUP';
COMMENT ON COLUMN student_preferences.preferred_lesson_type IS 'e.g. private, group, discovery';
COMMENT ON COLUMN student_preferences.preferred_duration IS 'Preferred lesson duration in minutes: 60, 90, 120, 150, or 180';
COMMENT ON COLUMN student_preferences.preferred_time_slot IS 'morning / afternoon / evening / any';
COMMENT ON COLUMN student_preferences.preferred_instructor_id IS 'Preferred instructor (FK to users). Nullable.';
COMMENT ON COLUMN student_preferences.preferred_lesson_languages IS 'Array of language codes the student prefers for lessons';
COMMENT ON COLUMN student_preferences.auto_assign_instructor IS 'If true, system may auto-assign any available instructor';
COMMENT ON COLUMN student_preferences.pay_at_center_default IS 'If true, default payment method is pay-at-center';

-- ============================================================
-- Table: student_safety_info
-- ============================================================

CREATE TABLE IF NOT EXISTS student_safety_info (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  emergency_contact_relationship VARCHAR(50),
  medical_notes TEXT,
  swimming_ability VARCHAR(50),  -- none/basic/confident/strong
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_safety_info_user ON student_safety_info(user_id);

COMMENT ON TABLE student_safety_info IS 'Emergency contact and medical/safety info for students. One row per student user.';
COMMENT ON COLUMN student_safety_info.emergency_contact_name IS 'Full name of emergency contact';
COMMENT ON COLUMN student_safety_info.emergency_contact_phone IS 'Phone number of emergency contact';
COMMENT ON COLUMN student_safety_info.emergency_contact_relationship IS 'Relationship to student, e.g. parent, spouse, friend';
COMMENT ON COLUMN student_safety_info.medical_notes IS 'Any medical conditions, allergies, or notes relevant to safety';
COMMENT ON COLUMN student_safety_info.swimming_ability IS 'Self-reported swimming ability: none / basic / confident / strong';

-- ============================================================
-- Table: instructor_preferences
-- ============================================================

CREATE TABLE IF NOT EXISTS instructor_preferences (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_group_size INTEGER DEFAULT 4 CHECK (max_group_size >= 2 AND max_group_size <= 8),
  preferred_durations INTEGER[] DEFAULT '{}',  -- array of minutes: 60, 90, 120, 180
  teaching_languages TEXT[] DEFAULT '{}',
  auto_accept_bookings BOOLEAN DEFAULT false,
  note_template TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_preferences_user ON instructor_preferences(user_id);

COMMENT ON TABLE instructor_preferences IS 'Per-instructor teaching preferences and defaults. One row per instructor user.';
COMMENT ON COLUMN instructor_preferences.max_group_size IS 'Maximum students per group lesson. Must be between 2 and 8.';
COMMENT ON COLUMN instructor_preferences.preferred_durations IS 'Array of preferred lesson durations in minutes, e.g. {60,90,120,180}';
COMMENT ON COLUMN instructor_preferences.teaching_languages IS 'Languages the instructor is comfortable teaching in';
COMMENT ON COLUMN instructor_preferences.auto_accept_bookings IS 'If true, new lesson bookings are auto-confirmed without manual approval';
COMMENT ON COLUMN instructor_preferences.note_template IS 'Default note/message template pre-filled when creating lesson notes';

-- ============================================================
-- Table: instructor_working_hours
-- ============================================================

CREATE TABLE IF NOT EXISTS instructor_working_hours (
  id SERIAL PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0=Sunday
  is_working BOOLEAN DEFAULT true,
  start_time TIME DEFAULT '09:00',
  end_time TIME DEFAULT '17:00',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_instructor_working_hours_instructor ON instructor_working_hours(instructor_id);

COMMENT ON TABLE instructor_working_hours IS 'Weekly working hours schedule per instructor. One row per (instructor, day_of_week) pair.';
COMMENT ON COLUMN instructor_working_hours.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN instructor_working_hours.is_working IS 'Whether the instructor works on this day of the week';
COMMENT ON COLUMN instructor_working_hours.start_time IS 'Start of working hours on this day';
COMMENT ON COLUMN instructor_working_hours.end_time IS 'End of working hours on this day';

-- ============================================================
-- Add new columns to notification_settings
-- ============================================================

-- Booking reminder 24h before lesson
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='booking_reminder_24h') THEN
        ALTER TABLE notification_settings ADD COLUMN booking_reminder_24h BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Booking reminder 1h before lesson
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='booking_reminder_1h') THEN
        ALTER TABLE notification_settings ADD COLUMN booking_reminder_1h BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Instructor: student check-in alerts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='student_checkin_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN student_checkin_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Instructor: schedule change alerts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='schedule_change_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN schedule_change_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Instructor: daily schedule digest
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='daily_schedule_summary') THEN
        ALTER TABLE notification_settings ADD COLUMN daily_schedule_summary BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Manager: daily operations summary
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='daily_ops_summary') THEN
        ALTER TABLE notification_settings ADD COLUMN daily_ops_summary BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Manager: new support ticket alerts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='support_ticket_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN support_ticket_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================================
-- Comments on new notification_settings columns
-- ============================================================

COMMENT ON COLUMN notification_settings.booking_reminder_24h IS 'Reminder notification 24 hours before a booked lesson';
COMMENT ON COLUMN notification_settings.booking_reminder_1h IS 'Reminder notification 1 hour before a booked lesson';
COMMENT ON COLUMN notification_settings.student_checkin_alerts IS 'Instructor: alert when a student checks in for a lesson';
COMMENT ON COLUMN notification_settings.schedule_change_alerts IS 'Instructor: alert when their schedule is changed by staff or admin';
COMMENT ON COLUMN notification_settings.daily_schedule_summary IS 'Instructor: daily digest of upcoming lessons for the day';
COMMENT ON COLUMN notification_settings.daily_ops_summary IS 'Manager: daily summary of operations (bookings, revenue, issues)';
COMMENT ON COLUMN notification_settings.support_ticket_alerts IS 'Manager: alert when a new support ticket is submitted';
