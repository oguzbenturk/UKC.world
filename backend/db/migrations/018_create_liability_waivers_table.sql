-- Migration: Create liability_waivers table
-- Date: 2025-10-13
-- Description: Stores digital signatures and waiver acceptance for users and family members

-- Create liability_waivers table
CREATE TABLE IF NOT EXISTS liability_waivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
  signer_user_id UUID NOT NULL REFERENCES users(id),
  waiver_version VARCHAR(20) NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'en',
  signature_image_url VARCHAR(500) NOT NULL,
  signature_data TEXT NOT NULL, -- Base64 encoded signature image
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT true,
  photo_consent BOOLEAN DEFAULT false,
  signed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure either user_id OR family_member_id is set, not both
  CONSTRAINT check_signee CHECK (
    (user_id IS NOT NULL AND family_member_id IS NULL) OR
    (user_id IS NULL AND family_member_id IS NOT NULL)
  )
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_waivers_user ON liability_waivers(user_id);
CREATE INDEX IF NOT EXISTS idx_waivers_family_member ON liability_waivers(family_member_id);
CREATE INDEX IF NOT EXISTS idx_waivers_signer ON liability_waivers(signer_user_id);
CREATE INDEX IF NOT EXISTS idx_waivers_signed_at ON liability_waivers(signed_at);
CREATE INDEX IF NOT EXISTS idx_waivers_version ON liability_waivers(waiver_version);

-- Add comments for documentation
COMMENT ON TABLE liability_waivers IS 'Digital signatures and liability waiver acceptance records';
COMMENT ON COLUMN liability_waivers.user_id IS 'User who is covered by the waiver (null if for family member)';
COMMENT ON COLUMN liability_waivers.family_member_id IS 'Family member covered by waiver (null if for user)';
COMMENT ON COLUMN liability_waivers.signer_user_id IS 'User who actually signed the waiver (parent/guardian)';
COMMENT ON COLUMN liability_waivers.signature_data IS 'Base64 encoded PNG signature image';
COMMENT ON CONSTRAINT check_signee ON liability_waivers IS 'Ensures waiver is for either user OR family member, not both';
