-- Migration: Add link_type column to quick_links table
-- Created: 2026-01-25
-- Purpose: Allow differentiation between registration forms and service quick links

-- Add link_type column
ALTER TABLE quick_links 
ADD COLUMN IF NOT EXISTS link_type VARCHAR(50) DEFAULT 'service';

-- Update existing records to have 'service' as the default
UPDATE quick_links 
SET link_type = 'service' 
WHERE link_type IS NULL;

-- Make service_type nullable since registration links don't need it
ALTER TABLE quick_links 
ALTER COLUMN service_type DROP NOT NULL;

-- Add check constraint for valid link_type values
ALTER TABLE quick_links 
ADD CONSTRAINT quick_links_link_type_check 
CHECK (link_type IN ('registration', 'service'));

-- Add comment
COMMENT ON COLUMN quick_links.link_type IS 'Type of quick link: registration (simple form) or service (specific service booking)';
