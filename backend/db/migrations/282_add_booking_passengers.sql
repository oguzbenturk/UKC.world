-- Migration 282: passengers count on bookings, for rescue boat trips.
-- Rescue bookings reuse existing columns for the rest of their fields:
--   instructor_user_id = the boat captain, location = pickup point, notes = note.
-- Only the passenger count needs a dedicated column. NULL for every non-rescue
-- booking, so existing behaviour is untouched.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS passengers INTEGER;

COMMENT ON COLUMN bookings.passengers IS
  'Number of people on a rescue boat trip. NULL for non-rescue bookings.';
