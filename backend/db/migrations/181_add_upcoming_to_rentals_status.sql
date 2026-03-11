-- 181_add_upcoming_to_rentals_status.sql
-- Allow 'upcoming' as a valid rental status (used when students book future rentals)

-- Drop and recreate the constraint with 'upcoming' included
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE rentals ADD CONSTRAINT rentals_status_check
  CHECK (status IN ('active', 'upcoming', 'completed', 'overdue', 'cancelled'));
