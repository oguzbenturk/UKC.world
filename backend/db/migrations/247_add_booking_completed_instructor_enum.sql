-- 247_add_booking_completed_instructor_enum.sql
-- Adds a notification type for "lesson completed" addressed to the instructor,
-- so we can dispatch a Telegram + in-app ping when a lesson is checked out.

ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_completed_instructor';
