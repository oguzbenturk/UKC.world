-- 243_add_booking_reminder_tracking.sql
-- Tracks whether the 24h-ahead lesson reminder email has been sent for each booking.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder_pending
  ON bookings(date, start_hour)
  WHERE reminder_sent_at IS NULL AND status = 'confirmed';
