-- 245_extend_notification_enum_for_telegram.sql
-- Adds the new instructor-side notification types introduced for Telegram
-- delivery to notification_type_enum. Without these, INSERTs into the
-- notifications table for the new types would fail with an enum cast error.

ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_assigned';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_reassigned_instructor';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_rescheduled_instructor';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_unassigned_instructor';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'booking_cancelled_instructor';
