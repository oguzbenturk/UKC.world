-- Add package_hours_used to booking_participants to track exact hours consumed per participant

ALTER TABLE booking_participants 
ADD COLUMN IF NOT EXISTS package_hours_used NUMERIC(10,2) DEFAULT 0.00;

COMMENT ON COLUMN booking_participants.package_hours_used IS 
'Exact number of package hours consumed by this participant for the booking (supports partial consumption).';
