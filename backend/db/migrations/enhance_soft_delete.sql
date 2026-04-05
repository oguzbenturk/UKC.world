-- Enhanced soft delete schema for bookings table
-- Add these columns to your existing bookings table

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deletion_metadata JSONB;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_deleted ON bookings(status, deleted_at);

-- Update existing cancelled bookings to use new soft delete approach
UPDATE bookings 
SET deleted_at = updated_at,
    deletion_reason = 'Legacy cancellation'
WHERE status = 'cancelled' AND deleted_at IS NULL;
