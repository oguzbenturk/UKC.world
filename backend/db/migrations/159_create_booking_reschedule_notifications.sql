-- Migration: 159_create_booking_reschedule_notifications
-- Purpose: Track booking reschedule events so students can be shown a confirmation pop-up
--          on their next login and receive email notifications.

CREATE TABLE IF NOT EXISTS booking_reschedule_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  -- What changed
  old_date DATE,
  new_date DATE,
  old_start_hour NUMERIC,
  new_start_hour NUMERIC,
  old_instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  new_instructor_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata
  service_name TEXT,
  old_instructor_name TEXT,
  new_instructor_name TEXT,
  message TEXT,

  -- Student confirmation
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  confirmed_at TIMESTAMPTZ,

  -- Email tracking
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups: pending notifications for a student
CREATE INDEX idx_reschedule_notif_student_pending
  ON booking_reschedule_notifications (student_user_id, status)
  WHERE status = 'pending';

-- Index for booking lookup
CREATE INDEX idx_reschedule_notif_booking
  ON booking_reschedule_notifications (booking_id);
