-- Migration: Add image_url column to equipment table
-- Description: Allow equipment to have a photo

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

-- Add a comment for clarity
COMMENT ON COLUMN equipment.image_url IS 'URL path to equipment photo';
