-- Migration: Add family member support to rentals table
-- Date: 2025-10-13
-- Description: Allows rentals to be associated with family members

-- Check if rentals table exists first
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rentals') THEN
    -- Add family_member_id column to rentals
    ALTER TABLE rentals 
    ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;

    -- Add participant_type column
    ALTER TABLE rentals 
    ADD COLUMN IF NOT EXISTS participant_type VARCHAR(20) DEFAULT 'self';

    -- Add check constraint for participant_type values
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.check_constraints 
      WHERE constraint_name = 'rentals_participant_type_check'
    ) THEN
      ALTER TABLE rentals 
      ADD CONSTRAINT rentals_participant_type_check 
      CHECK (participant_type IN ('self', 'family_member'));
    END IF;

    -- Create index for family_member_id lookups
    CREATE INDEX IF NOT EXISTS idx_rentals_family_member ON rentals(family_member_id);

    -- Add comments
    EXECUTE 'COMMENT ON COLUMN rentals.family_member_id IS ''References family_members table if rental is for a family member''';
    EXECUTE 'COMMENT ON COLUMN rentals.participant_type IS ''Indicates if rental is for self or family_member''';
  END IF;
END $$;
