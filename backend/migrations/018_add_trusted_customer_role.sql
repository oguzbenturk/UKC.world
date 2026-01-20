-- Migration: Add trusted_customer role
-- Description: Creates a new role for verified customers who can use "Pay at Center" option
-- This role is used to prevent fake bookings from untrusted users (outsiders, students)

-- Check if the role already exists before inserting
INSERT INTO roles (id, name, created_at, updated_at)
SELECT 
  'a7b8c9d0-e1f2-43a4-b5c6-d7e8f9a0b1c2',
  'trusted_customer',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE name = 'trusted_customer'
);

-- Add comment explaining the role
COMMENT ON TABLE roles IS 'User roles. trusted_customer role allows "Pay at Center" option for verified customers.';
