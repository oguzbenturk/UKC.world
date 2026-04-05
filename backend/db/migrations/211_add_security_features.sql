-- Migration: Add Two-Factor Authentication and Enhanced Security Features
-- Version: 002
-- Date: 2025-07-06

-- Add 2FA columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(32),
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS account_expired_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login_ip INET;

-- Add security audit table for tracking sensitive operations
CREATE TABLE IF NOT EXISTS security_audit (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add session management table for JWT blacklisting
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    token_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Add API keys table for service-to-service authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id),
    permissions JSONB DEFAULT '{}',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_two_factor ON users(two_factor_enabled) WHERE two_factor_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_locked, account_expired_at);
CREATE INDEX IF NOT EXISTS idx_users_failed_logins ON users(failed_login_attempts, last_failed_login_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_user_action ON security_audit(user_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_resource ON security_audit(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, is_active);

-- Add updated_at trigger for api_keys
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at 
    BEFORE UPDATE ON api_keys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add default roles with enhanced permissions structure
INSERT INTO roles (name, description, permissions) VALUES 
('super_admin', 'Super Administrator with full system access', '{
    "*": true
}'),
('admin', 'Administrator with most system access', '{
    "users:read": true,
    "users:write": true,
    "bookings:*": true,
    "services:*": true,
    "equipment:*": true,
    "finances:read": true,
    "reports:*": true,
    "settings:read": true
}'),
('manager', 'Manager with operational access', '{
    "users:read": true,
    "bookings:*": true,
    "services:read": true,
    "equipment:*": true,
    "finances:read": true,
    "reports:read": true
}'),
('instructor', 'Instructor with booking and student access', '{
    "bookings:read": true,
    "bookings:write": true,
    "students:read": true,
    "students:write": true,
    "services:read": true,
    "equipment:read": true
}'),
('customer', 'Customer with limited access', '{
    "bookings:read": true,
    "services:read": true,
    "profile:write": true
}')
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = CURRENT_TIMESTAMP;

-- Add security settings to system settings
INSERT INTO settings (key, value, description) VALUES 
('security.max_failed_logins', '5', 'Maximum failed login attempts before account lock'),
('security.account_lock_duration', '1800', 'Account lock duration in seconds (30 minutes)'),
('security.password_min_length', '8', 'Minimum password length'),
('security.password_require_special', 'true', 'Require special characters in passwords'),
('security.session_timeout', '86400', 'Session timeout in seconds (24 hours)'),
('security.2fa_required_for_admin', 'true', 'Require 2FA for admin operations'),
('security.api_rate_limit', '100', 'API rate limit per minute per IP')
ON CONFLICT (key) DO NOTHING;

-- Add comment for tracking
COMMENT ON TABLE security_audit IS 'Audit trail for security-sensitive operations';
COMMENT ON TABLE user_sessions IS 'Active user sessions for JWT token management';
COMMENT ON TABLE api_keys IS 'API keys for service-to-service authentication';

-- Migration complete
SELECT 'Security features migration completed successfully' as status;
