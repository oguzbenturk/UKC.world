-- Migration 231: Add accommodation_booking_id to bank_transfer_receipts
-- Links accommodation deposit payments to the bank transfer receipt approval workflow

ALTER TABLE bank_transfer_receipts
  ADD COLUMN IF NOT EXISTS accommodation_booking_id UUID REFERENCES accommodation_bookings(id);

CREATE INDEX IF NOT EXISTS idx_btr_accommodation_booking
  ON bank_transfer_receipts(accommodation_booking_id)
  WHERE accommodation_booking_id IS NOT NULL;
