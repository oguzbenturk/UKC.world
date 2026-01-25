-- Migration: Create form template versions table for version control
-- Provides snapshot storage for form template history

-- Create form_template_versions table
CREATE TABLE IF NOT EXISTS form_template_versions (
    id SERIAL PRIMARY KEY,
    form_template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100),
    snapshot_data JSONB NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique version numbers per template
    CONSTRAINT unique_version_per_template UNIQUE (form_template_id, version_number)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_form_template_versions_template 
    ON form_template_versions(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_template_versions_created 
    ON form_template_versions(created_at DESC);

-- Add version tracking columns to form_templates
ALTER TABLE form_templates 
    ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS published_version INTEGER,
    ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP WITH TIME ZONE;

-- Comment on table
COMMENT ON TABLE form_template_versions IS 'Stores version history snapshots for form templates';
COMMENT ON COLUMN form_template_versions.snapshot_data IS 'Complete JSON snapshot of form template including steps and fields';
COMMENT ON COLUMN form_template_versions.change_summary IS 'Description of changes in this version';
