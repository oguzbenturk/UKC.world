-- Migration: Add new_booking_alerts to notification_settings
-- This allows staff members to toggle notifications for new booking requests

-- Add new_booking_alerts column if it doesn't exist
ALTER TABLE notification_settings 
ADD COLUMN IF NOT EXISTS new_booking_alerts BOOLEAN DEFAULT true;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- Comment on the column
COMMENT ON COLUMN notification_settings.new_booking_alerts IS 'Whether user receives notifications when new bookings are created. Default true for staff members.';
