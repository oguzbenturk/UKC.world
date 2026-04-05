-- Migration: Create form_templates table for custom form builder
-- Created: 2026-01-25
-- Purpose: Store form template definitions

-- Form templates table - stores form configurations
CREATE TABLE IF NOT EXISTS form_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'registration', -- 'service', 'registration', 'survey', 'contact'
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    theme_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{
        "allow_save_progress": true,
        "show_progress_bar": true,
        "require_captcha": false,
        "allow_anonymous": true,
        "confirmation_message": "Thank you for your submission!",
        "redirect_url": null
    }',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_templates_category ON form_templates(category);
CREATE INDEX IF NOT EXISTS idx_form_templates_active ON form_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_form_templates_created_by ON form_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_form_templates_deleted_at ON form_templates(deleted_at) WHERE deleted_at IS NULL;

-- Add constraint for valid categories
ALTER TABLE form_templates 
ADD CONSTRAINT form_templates_category_check 
CHECK (category IN ('service', 'registration', 'survey', 'contact'));

-- Add comment
COMMENT ON TABLE form_templates IS 'Stores custom form template definitions for the form builder system';
COMMENT ON COLUMN form_templates.theme_config IS 'JSON object with colors, fonts, branding settings';
COMMENT ON COLUMN form_templates.settings IS 'JSON object with form behavior settings';
