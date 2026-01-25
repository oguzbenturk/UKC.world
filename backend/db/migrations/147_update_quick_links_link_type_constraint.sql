-- Migration: Update quick_links link_type constraint to include 'form'
-- Created: 2026-01-25
-- Purpose: Allow 'form' as a valid link_type for form builder integration

-- Drop the old constraint
ALTER TABLE quick_links DROP CONSTRAINT IF EXISTS quick_links_link_type_check;

-- Add the new constraint with 'form' included
ALTER TABLE quick_links ADD CONSTRAINT quick_links_link_type_check 
  CHECK (link_type IN ('registration', 'service', 'form'));

-- Add comment
COMMENT ON CONSTRAINT quick_links_link_type_check ON quick_links IS 'Valid link types: registration (general signup), service (specific service), form (custom form)';
