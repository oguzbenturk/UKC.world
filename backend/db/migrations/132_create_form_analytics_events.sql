-- Migration: 132_create_form_analytics_events.sql
-- Description: Create table for tracking form view and submission analytics events
-- Created: 2026-01-25

-- Create form_analytics_events table
CREATE TABLE IF NOT EXISTS form_analytics_events (
    id SERIAL PRIMARY KEY,
    form_template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    quick_link_id INTEGER REFERENCES quick_links(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    session_id VARCHAR(100),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    referrer TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_form_analytics_form_id ON form_analytics_events(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_analytics_event_type ON form_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_form_analytics_created_at ON form_analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_form_analytics_session ON form_analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_form_analytics_quick_link ON form_analytics_events(quick_link_id);

-- Add comment for documentation
COMMENT ON TABLE form_analytics_events IS 'Tracks form view, start, step navigation, and submission events for analytics';
COMMENT ON COLUMN form_analytics_events.event_type IS 'Types: form_view, form_start, step_change, form_submit, form_abandon, save_draft';
COMMENT ON COLUMN form_analytics_events.metadata IS 'JSON containing step_id, field_errors, completion_time, etc.';
