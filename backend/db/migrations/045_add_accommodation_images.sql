-- Migration: Add images columns to accommodation_units table
-- Matches the pattern used by products table

-- Add main image URL column
ALTER TABLE accommodation_units 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add multiple images column (JSONB array of image URLs)
ALTER TABLE accommodation_units 
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN accommodation_units.image_url IS 'Primary/thumbnail image URL for the accommodation unit';
COMMENT ON COLUMN accommodation_units.images IS 'Array of additional image URLs for the accommodation unit gallery';
