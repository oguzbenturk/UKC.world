-- Add cash_hours_used to booking_participants to track exact non-package hours per participant

ALTER TABLE booking_participants 
ADD COLUMN IF NOT EXISTS cash_hours_used NUMERIC(10,2) DEFAULT 0.00;

COMMENT ON COLUMN booking_participants.cash_hours_used IS 
'Exact number of non-package (cash) hours attributed to this participant for the booking.';
