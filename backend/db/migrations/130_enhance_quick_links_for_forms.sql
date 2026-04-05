-- Migration: Enhance quick_links table for form builder integration
-- Created: 2026-01-25
-- Purpose: Link quick links to custom form templates

-- Add form_template_id to quick_links
ALTER TABLE quick_links 
ADD COLUMN IF NOT EXISTS form_template_id INTEGER REFERENCES form_templates(id) ON DELETE SET NULL;

-- Add auto_create_booking option
ALTER TABLE quick_links 
ADD COLUMN IF NOT EXISTS auto_create_booking BOOLEAN DEFAULT false;

-- Add notification_recipients for additional email alerts
ALTER TABLE quick_links 
ADD COLUMN IF NOT EXISTS notification_recipients TEXT[];

-- Create index for form template lookup
CREATE INDEX IF NOT EXISTS idx_quick_links_form_template ON quick_links(form_template_id);

-- Add comments
COMMENT ON COLUMN quick_links.form_template_id IS 'Reference to custom form template, null means use default form';
COMMENT ON COLUMN quick_links.auto_create_booking IS 'Automatically create calendar booking on form approval';
COMMENT ON COLUMN quick_links.notification_recipients IS 'Additional email addresses to notify on submission';
