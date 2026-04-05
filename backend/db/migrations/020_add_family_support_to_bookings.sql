-- Migration: Add family member support to bookings table
-- Date: 2025-10-13
-- Description: Allows bookings to be associated with family members

-- Add family_member_id column to bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;

-- Add participant_type column
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS participant_type VARCHAR(20) DEFAULT 'self';

-- Add check constraint for participant_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'bookings_participant_type_check'
  ) THEN
    ALTER TABLE bookings 
    ADD CONSTRAINT bookings_participant_type_check 
    CHECK (participant_type IN ('self', 'family_member'));
  END IF;
END $$;

-- Create index for family_member_id lookups
CREATE INDEX IF NOT EXISTS idx_bookings_family_member ON bookings(family_member_id);

-- Add comments
COMMENT ON COLUMN bookings.family_member_id IS 'References family_members table if booking is for a family member';
COMMENT ON COLUMN bookings.participant_type IS 'Indicates if booking is for self or family_member';
