-- Migration: Add consent field type and fix date_range
-- Date: 2026-01-25
-- Description: Add 'consent' field type and 'date_range' to the allowed field types

-- Drop the existing constraint
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_type_check;

-- Re-add with additional field types
ALTER TABLE form_fields 
ADD CONSTRAINT form_fields_type_check 
CHECK (field_type IN (
    'text', 'email', 'phone', 'number', 'url', 'password',
    'select', 'multiselect', 'radio', 'checkbox', 'toggle',
    'date', 'time', 'datetime', 'daterange', 'date_range',
    'textarea', 'richtext',
    'file', 'image', 'signature',
    'rating', 'slider', 'address', 'country',
    'calculated', 'hidden', 'consent',
    'section_header', 'paragraph', 'html'
));

COMMENT ON CONSTRAINT form_fields_type_check ON form_fields IS 'Valid field types including consent for GDPR compliance';
