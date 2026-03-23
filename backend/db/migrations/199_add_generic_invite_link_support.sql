-- Add generic invite link support to group_booking_participants
-- Generic links allow sharing without requiring the invitee's email upfront

ALTER TABLE group_booking_participants
  ADD COLUMN IF NOT EXISTS is_generic_link BOOLEAN NOT NULL DEFAULT FALSE;

-- Add packageId to group_bookings so the friend landing page can reference the package
ALTER TABLE group_bookings
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES service_packages(id) ON DELETE SET NULL;
