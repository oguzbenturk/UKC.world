-- Add suggest-time support for group booking participants
ALTER TABLE group_booking_participants
  ADD COLUMN IF NOT EXISTS suggested_date DATE,
  ADD COLUMN IF NOT EXISTS suggested_time TIME,
  ADD COLUMN IF NOT EXISTS suggestion_message TEXT;
