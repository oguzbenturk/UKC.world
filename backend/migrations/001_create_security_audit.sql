-- Migration: Create security_audit table
-- Created: 2025-07-29
-- Description: Add security audit logging table

CREATE TABLE IF NOT EXISTS security_audit (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_audit_user_id ON security_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_action ON security_audit(action);
CREATE INDEX IF NOT EXISTS idx_security_audit_created_at ON security_audit(created_at);
