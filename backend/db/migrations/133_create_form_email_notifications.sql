-- Migration: Create form_email_notifications table
-- Purpose: Store email notification templates and settings for form submissions

-- Create form_email_notifications table
CREATE TABLE IF NOT EXISTS form_email_notifications (
    id SERIAL PRIMARY KEY,
    form_template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    
    -- Notification type
    notification_type VARCHAR(50) NOT NULL, -- 'submission_confirmation', 'admin_alert', 'status_update', 'reminder'
    
    -- Email template
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT, -- Plain text fallback
    
    -- Recipients configuration
    recipient_type VARCHAR(50) NOT NULL DEFAULT 'submitter', -- 'submitter', 'admin', 'custom', 'form_field'
    recipient_emails TEXT[], -- For custom recipients
    recipient_field_name VARCHAR(100), -- For dynamic recipient from form field
    cc_emails TEXT[],
    bcc_emails TEXT[],
    reply_to VARCHAR(255),
    
    -- Trigger conditions
    trigger_status VARCHAR(50), -- For status_update: 'approved', 'rejected', 'processed'
    trigger_delay_minutes INTEGER DEFAULT 0, -- Delay before sending (for reminders)
    
    -- Settings
    is_active BOOLEAN DEFAULT true,
    include_submission_data BOOLEAN DEFAULT true,
    include_confirmation_number BOOLEAN DEFAULT true,
    
    -- Template variables info (for UI hints)
    available_variables JSONB DEFAULT '[]',
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_form_email_notifications_form_id ON form_email_notifications(form_template_id);
CREATE INDEX idx_form_email_notifications_type ON form_email_notifications(notification_type);
CREATE INDEX idx_form_email_notifications_active ON form_email_notifications(is_active);

-- Create sent_emails log table for tracking
CREATE TABLE IF NOT EXISTS form_email_logs (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER REFERENCES form_email_notifications(id) ON DELETE SET NULL,
    form_submission_id INTEGER REFERENCES form_submissions(id) ON DELETE CASCADE,
    
    -- Email details
    recipient_email VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
    error_message TEXT,
    
    -- Metadata
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_form_email_logs_submission ON form_email_logs(form_submission_id);
CREATE INDEX idx_form_email_logs_status ON form_email_logs(status);

-- Insert default notification templates for future forms (optional sample)
-- These can be cloned when creating a new form
INSERT INTO form_email_notifications (
    form_template_id,
    notification_type,
    subject,
    body_html,
    body_text,
    recipient_type,
    is_active,
    include_submission_data,
    include_confirmation_number
) 
SELECT 
    id,
    'submission_confirmation',
    'Thank you for your submission - {{form_name}}',
    E'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<h2 style="color: #333;">Thank You for Your Submission!</h2>
<p>Dear {{customer_name}},</p>
<p>We have received your submission for <strong>{{form_name}}</strong>.</p>
<p>Your confirmation number is: <strong>{{confirmation_number}}</strong></p>
<h3>Submission Details:</h3>
{{submission_summary}}
<p style="margin-top: 20px;">We will review your submission and get back to you shortly.</p>
<p>Best regards,<br>The Team</p>
</div>',
    E'Thank you for your submission!\n\nWe have received your submission for {{form_name}}.\n\nYour confirmation number is: {{confirmation_number}}\n\nSubmission Details:\n{{submission_summary_text}}\n\nWe will review your submission and get back to you shortly.\n\nBest regards,\nThe Team',
    'submitter',
    false, -- Disabled by default, admin can enable per form
    true,
    true
FROM form_templates 
WHERE id = (SELECT MIN(id) FROM form_templates)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE form_email_notifications IS 'Email notification templates and settings for form submissions';
COMMENT ON COLUMN form_email_notifications.notification_type IS 'Type of notification: submission_confirmation, admin_alert, status_update, reminder';
COMMENT ON COLUMN form_email_notifications.recipient_type IS 'Who receives this email: submitter (from form), admin, custom list, or form_field reference';
COMMENT ON COLUMN form_email_notifications.available_variables IS 'JSON array of available template variables for this form';
