-- Migration: Add support for multi-user group bookings
-- This migration creates a new table to store multiple participants for each booking

-- Create booking_participants table to support group bookings
CREATE TABLE IF NOT EXISTS booking_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    payment_amount NUMERIC(10,2) DEFAULT 0.00,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure no duplicate participants per booking
    UNIQUE(booking_id, user_id)
);

-- Add indexes for better performance
CREATE INDEX idx_booking_participants_booking_id ON booking_participants(booking_id);
CREATE INDEX idx_booking_participants_user_id ON booking_participants(user_id);
CREATE INDEX idx_booking_participants_primary ON booking_participants(booking_id, is_primary);

-- Add a column to bookings table to track group size
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_size INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 10;

-- Update existing bookings to populate booking_participants table
-- This creates a participant record for each existing booking using the student_user_id
INSERT INTO booking_participants (booking_id, user_id, is_primary, payment_status, payment_amount)
SELECT 
    id as booking_id,
    student_user_id as user_id,
    TRUE as is_primary,
    payment_status,
    amount as payment_amount
FROM bookings 
WHERE student_user_id IS NOT NULL
AND id NOT IN (SELECT DISTINCT booking_id FROM booking_participants);

-- Add comments for documentation
COMMENT ON TABLE booking_participants IS 'Stores multiple participants for group bookings';
COMMENT ON COLUMN booking_participants.is_primary IS 'Indicates the main participant/organizer of the booking';
COMMENT ON COLUMN booking_participants.payment_status IS 'Individual payment status for this participant';
COMMENT ON COLUMN booking_participants.payment_amount IS 'Amount this participant needs to pay';
COMMENT ON COLUMN bookings.group_size IS 'Number of participants in this booking';
COMMENT ON COLUMN bookings.max_participants IS 'Maximum allowed participants for this booking type';
