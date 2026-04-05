-- Migration: Create form_submissions table for form builder
-- Created: 2026-01-25
-- Purpose: Store form submission data

-- Form submissions table - stores submitted form data
CREATE TABLE IF NOT EXISTS form_submissions (
    id SERIAL PRIMARY KEY,
    quick_link_id INTEGER REFERENCES quick_links(id) ON DELETE SET NULL,
    form_template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    session_id VARCHAR(100), -- For tracking partial submissions
    status VARCHAR(50) DEFAULT 'submitted', -- 'draft', 'submitted', 'processed', 'archived'
    submission_data JSONB NOT NULL DEFAULT '{}', -- All form field responses
    metadata JSONB DEFAULT '{}', -- ip_address, user_agent, referrer, utm_params, duration
    user_id UUID REFERENCES users(id), -- If linked to a user account
    submitted_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES users(id),
    notes TEXT, -- Admin notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_submissions_quick_link ON form_submissions(quick_link_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON form_submissions(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_session ON form_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at ON form_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_data ON form_submissions USING gin(submission_data);

-- Add constraint for valid status values
ALTER TABLE form_submissions 
ADD CONSTRAINT form_submissions_status_check 
CHECK (status IN ('draft', 'submitted', 'processed', 'archived', 'cancelled'));

-- Add comments
COMMENT ON TABLE form_submissions IS 'Stores form submission data from public forms';
COMMENT ON COLUMN form_submissions.submission_data IS 'JSON object containing all field values';
COMMENT ON COLUMN form_submissions.metadata IS 'JSON object with submission context (IP, user agent, etc.)';
COMMENT ON COLUMN form_submissions.session_id IS 'Unique session ID for tracking partial/resumed submissions';
