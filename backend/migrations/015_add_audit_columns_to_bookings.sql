-- Add audit columns (created_by, updated_by) to bookings table
-- Migration: 015_add_audit_columns_to_bookings

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_updated_by ON bookings(updated_by);
