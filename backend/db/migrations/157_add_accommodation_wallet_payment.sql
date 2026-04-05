-- Migration 157: Add wallet payment tracking to accommodation bookings
-- When a student books accommodation, money is deducted from their wallet.
-- If admin declines/cancels, the money is refunded back to the wallet.

ALTER TABLE accommodation_bookings
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2) DEFAULT 0;

-- payment_status values: 'unpaid', 'paid', 'refunded'
-- wallet_transaction_id: references the wallet_transactions row for audit trail
-- payment_amount: the actual amount deducted (may differ from total_price if currency conversion)
