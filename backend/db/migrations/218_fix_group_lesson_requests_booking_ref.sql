-- Migration 201: Fix group_lesson_requests booking reference
-- The original migration referenced group_bookings(id) which doesn't exist.
-- Bookings created via /api/bookings/group are stored in the bookings table.
-- Replace matched_group_booking_id with matched_booking_id → bookings(id).

ALTER TABLE group_lesson_requests
  DROP COLUMN IF EXISTS matched_group_booking_id;

ALTER TABLE group_lesson_requests
  ADD COLUMN IF NOT EXISTS matched_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_matched_booking
  ON group_lesson_requests(matched_booking_id)
  WHERE matched_booking_id IS NOT NULL;
