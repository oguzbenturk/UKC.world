-- Migration 201: Create bank_transfer_receipts table and update booking payment_status constraint
-- Tracks bank transfer receipts for admin approval workflow

CREATE TABLE IF NOT EXISTS bank_transfer_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  customer_package_id UUID REFERENCES customer_packages(id),
  booking_id UUID REFERENCES bookings(id),
  bank_account_id UUID,
  receipt_url TEXT,
  amount NUMERIC(12,2),
  currency VARCHAR(10) DEFAULT 'EUR',
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_receipts_status ON bank_transfer_receipts(status);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_receipts_user ON bank_transfer_receipts(user_id);
