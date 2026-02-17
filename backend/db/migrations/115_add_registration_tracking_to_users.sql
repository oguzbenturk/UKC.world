-- Migration: Add registration tracking columns to users table
-- Created: 2026-01-18
-- Purpose: Track how users registered and if they completed their profile

-- Add registration source column to track where user came from
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source VARCHAR(50);

-- Add registration complete flag - false for quick link users until they complete profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_complete BOOLEAN DEFAULT true;

-- Add contact preference column for quick link registrations
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(20);

-- Add country code column for phone numbers
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(10);

-- Update existing users to have complete registration
UPDATE users SET registration_complete = true WHERE registration_complete IS NULL;

-- Create index for finding incomplete registrations
CREATE INDEX IF NOT EXISTS idx_users_registration_complete ON users(registration_complete) WHERE registration_complete = false;

COMMENT ON COLUMN users.registration_source IS 'How user was created: quick_link, self_registration, admin_created, etc.';
COMMENT ON COLUMN users.registration_complete IS 'False for users who need to complete profile before booking';
COMMENT ON COLUMN users.contact_preference IS 'Preferred contact method: whatsapp, phone, email';
COMMENT ON COLUMN users.phone_country_code IS 'Country code for phone number, e.g., +90, +1';
