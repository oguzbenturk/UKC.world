-- Migration: Fix service_id column type in quick_links table
-- Change from INTEGER to UUID to match services table
-- Created: 2026-01-28

-- Drop existing service_id column if it has data (backup first if needed in production)
ALTER TABLE quick_links 
DROP COLUMN IF EXISTS service_id;

-- Re-add service_id column with correct UUID type
ALTER TABLE quick_links 
ADD COLUMN service_id UUID;

COMMENT ON COLUMN quick_links.service_id IS 'Optional: UUID of specific service from services table';
