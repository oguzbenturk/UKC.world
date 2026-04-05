-- Add address fields to users table for shipping/billing and Iyzico integration
-- Migration: 168_add_user_address_fields.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Add comments
COMMENT ON COLUMN users.address IS 'Street address for shipping/billing';
COMMENT ON COLUMN users.city IS 'City for shipping/billing';
COMMENT ON COLUMN users.country IS 'Country for shipping/billing';
COMMENT ON COLUMN users.zip_code IS 'Postal/ZIP code for shipping/billing';

-- Index on country for potential filtering
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country) WHERE country IS NOT NULL AND deleted_at IS NULL;
