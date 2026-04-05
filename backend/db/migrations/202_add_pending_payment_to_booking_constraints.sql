-- Add pending_payment and waiting_payment to booking status and payment_status constraints
-- Required for bank transfer flow where bookings are created before payment is confirmed

-- Drop and recreate check_booking_status with new allowed values
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_booking_status;
ALTER TABLE bookings ADD CONSTRAINT check_booking_status
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show',
                    'checked-in', 'checked-out', 'pending_partner', 'pending_payment'));

-- Drop and recreate check_payment_status with new allowed values
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS check_payment_status;
ALTER TABLE bookings ADD CONSTRAINT check_payment_status
  CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'partial', 'package',
                            'mixed', 'balance', 'pending_payment', 'waiting_payment', 'failed'));

-- Update the unique overlap index to also exclude pending_payment bookings
-- so they don't block real confirmed bookings from occupying the same slot
DROP INDEX IF EXISTS idx_bookings_no_overlap;
CREATE UNIQUE INDEX idx_bookings_no_overlap ON bookings
  (instructor_user_id, date, start_hour, duration)
  WHERE status NOT IN ('cancelled', 'pending_payment') AND deleted_at IS NULL;
