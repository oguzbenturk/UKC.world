-- Migration: 111_add_image_to_member_offerings.sql
-- Description: Add image_url column to member_offerings for custom card backgrounds
-- Created: 2026-01-17

-- Add image_url column for custom membership card images
ALTER TABLE member_offerings 
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

-- Add comment for documentation
COMMENT ON COLUMN member_offerings.image_url IS 'URL to custom image for the membership card display';
