-- Migration: Create family_members table
-- Date: 2025-10-13
-- Description: Allows students to add family members (children under 18) to their account

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create family_members table
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  relationship VARCHAR(50) NOT NULL,
  gender VARCHAR(50),
  medical_notes TEXT, -- Will be encrypted at application layer
  emergency_contact VARCHAR(50),
  photo_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Constraint: family members must be under 18 years old
  CONSTRAINT age_check CHECK (
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) < 18
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_members_parent ON family_members(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_active ON family_members(is_active);
CREATE INDEX IF NOT EXISTS idx_family_members_deleted ON family_members(deleted_at) WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE family_members IS 'Stores family members (children under 18) associated with student accounts';
COMMENT ON COLUMN family_members.medical_notes IS 'Encrypted medical information for emergency reference';
COMMENT ON CONSTRAINT age_check ON family_members IS 'Ensures family member is under 18 years old';
