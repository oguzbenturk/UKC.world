-- Migration: Create form_fields table for form builder
-- Created: 2026-01-25
-- Purpose: Store individual fields within form steps

-- Form fields table - stores individual form fields
CREATE TABLE IF NOT EXISTS form_fields (
    id SERIAL PRIMARY KEY,
    form_step_id INTEGER NOT NULL REFERENCES form_steps(id) ON DELETE CASCADE,
    field_type VARCHAR(50) NOT NULL, -- text, email, phone, select, radio, checkbox, date, etc.
    field_name VARCHAR(100) NOT NULL, -- Unique key for storage (e.g., 'preferred_time')
    field_label VARCHAR(255) NOT NULL, -- Display label (e.g., 'Preferred Time')
    placeholder_text VARCHAR(255),
    help_text TEXT, -- Tooltip/hint text
    default_value TEXT,
    is_required BOOLEAN DEFAULT false,
    is_readonly BOOLEAN DEFAULT false,
    order_index INTEGER NOT NULL DEFAULT 0,
    width VARCHAR(20) DEFAULT 'full', -- 'full', 'half', 'third'
    validation_rules JSONB DEFAULT '{}', -- min_length, max_length, pattern, etc.
    options JSONB DEFAULT '[]', -- For select/radio/checkbox: [{value, label, icon}]
    conditional_logic JSONB DEFAULT '{}', -- show_if, required_if conditions
    integration_mapping VARCHAR(100), -- Maps to system field (e.g., 'user.email')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_fields_step_id ON form_fields(form_step_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_order ON form_fields(form_step_id, order_index);
CREATE INDEX IF NOT EXISTS idx_form_fields_type ON form_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_form_fields_name ON form_fields(field_name);

-- Add constraint for valid field types
ALTER TABLE form_fields 
ADD CONSTRAINT form_fields_type_check 
CHECK (field_type IN (
    'text', 'email', 'phone', 'number', 'url', 'password',
    'select', 'multiselect', 'radio', 'checkbox', 'toggle',
    'date', 'time', 'datetime', 'daterange',
    'textarea', 'richtext',
    'file', 'image', 'signature',
    'rating', 'slider', 'address', 'country',
    'calculated', 'hidden',
    'section_header', 'paragraph', 'html'
));

-- Add constraint for valid width values
ALTER TABLE form_fields 
ADD CONSTRAINT form_fields_width_check 
CHECK (width IN ('full', 'half', 'third'));

-- Add comments
COMMENT ON TABLE form_fields IS 'Stores individual fields within form steps';
COMMENT ON COLUMN form_fields.field_type IS 'Type of field: text, email, select, date, etc.';
COMMENT ON COLUMN form_fields.field_name IS 'Unique storage key for the field value';
COMMENT ON COLUMN form_fields.validation_rules IS 'JSON object with validation rules';
COMMENT ON COLUMN form_fields.options IS 'JSON array of options for select/radio/checkbox fields';
COMMENT ON COLUMN form_fields.conditional_logic IS 'JSON conditions for show/hide logic';
