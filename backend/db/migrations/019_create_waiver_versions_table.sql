-- Migration: Create waiver_versions table
-- Date: 2025-10-13
-- Description: Stores different versions of liability waiver text for versioning and auditing

-- Create waiver_versions table
CREATE TABLE IF NOT EXISTS waiver_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_number VARCHAR(20) NOT NULL UNIQUE,
  language_code VARCHAR(10) NOT NULL,
  content TEXT NOT NULL, -- Full waiver text in HTML or markdown format
  is_active BOOLEAN DEFAULT true,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_waiver_versions_active ON waiver_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_waiver_versions_language ON waiver_versions(language_code);
CREATE INDEX IF NOT EXISTS idx_waiver_versions_effective ON waiver_versions(effective_date);

-- Add unique constraint for version + language
CREATE UNIQUE INDEX IF NOT EXISTS idx_waiver_versions_unique ON waiver_versions(version_number, language_code);

-- Add comments
COMMENT ON TABLE waiver_versions IS 'Stores historical versions of liability waiver text';
COMMENT ON COLUMN waiver_versions.version_number IS 'Semantic version number (e.g., 1.0, 1.1, 2.0)';
COMMENT ON COLUMN waiver_versions.content IS 'Full waiver text with all legal clauses';
COMMENT ON COLUMN waiver_versions.is_active IS 'Only one version per language should be active at a time';
