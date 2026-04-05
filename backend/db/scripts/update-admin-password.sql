-- update-admin-password.sql
-- This SQL file contains commands to update the admin user with a working password

-- First, ensure the admin role exists
INSERT INTO roles (id, name, description)
SELECT 
  '1', 'admin', 'System administrator with full access'
WHERE 
  NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin');

-- Then update or create the admin user with a pre-hashed password for 'admin123'
UPDATE users 
SET 
  password_hash = '$2b$10$1QKI4ywj3ez8hLDMc/MP4uEJ7JL15FVGW1/ZmDaZvMQqNJQqwgqYm',
  role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE 
  email = 'admin@kitesurfpro.com';

-- Insert the admin user if it doesn't exist
INSERT INTO users (
  id, name, email, password_hash, role_id, first_name, last_name, preferred_currency, created_at, updated_at
)
SELECT
  'admin-id-123', 'Admin User', 'admin@kitesurfpro.com', 
  '$2b$10$1QKI4ywj3ez8hLDMc/MP4uEJ7JL15FVGW1/ZmDaZvMQqNJQqwgqYm',
  (SELECT id FROM roles WHERE name = 'admin'),
  'Admin', 'User', 'EUR', NOW(), NOW()
WHERE
  NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@kitesurfpro.com');
