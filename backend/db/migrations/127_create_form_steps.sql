-- Migration: Create form_steps table for form builder
-- Created: 2026-01-25
-- Purpose: Store steps/sections within form templates

-- Form steps table - stores steps within a form
CREATE TABLE IF NOT EXISTS form_steps (
    id SERIAL PRIMARY KEY,
    form_template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    show_progress BOOLEAN DEFAULT true,
    completion_message TEXT, -- Message shown after completing this step
    skip_logic JSONB DEFAULT '{}', -- Conditions to skip this step
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_steps_template_id ON form_steps(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_steps_order ON form_steps(form_template_id, order_index);

-- Add comments
COMMENT ON TABLE form_steps IS 'Stores steps/sections within form templates';
COMMENT ON COLUMN form_steps.order_index IS 'Display order of the step within the form';
COMMENT ON COLUMN form_steps.skip_logic IS 'JSON conditions to skip this step based on field values';
