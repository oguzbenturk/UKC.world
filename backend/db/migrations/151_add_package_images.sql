-- Migration: Add images column to service_packages table
-- Allows packages (especially accommodation packages) to have multiple photos/room images

-- Add multiple images column (JSONB array of image URLs)
ALTER TABLE service_packages
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN service_packages.images IS 'Array of additional image URLs for package gallery (e.g., room photos for accommodation packages)';
