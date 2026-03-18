-- Add 'pending' to rentals status check constraint for approval workflow
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE rentals ADD CONSTRAINT rentals_status_check
  CHECK (status::text = ANY (ARRAY['active','upcoming','completed','overdue','cancelled','pending']::text[]));
