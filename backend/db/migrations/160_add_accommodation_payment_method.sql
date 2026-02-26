-- Migration 160: Add payment_method column to accommodation_bookings
-- Supports 'wallet' (default) and 'pay_later' for trusted customers.

ALTER TABLE accommodation_bookings
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'wallet';

-- Backfill existing rows that have wallet_transaction_id set
UPDATE accommodation_bookings
  SET payment_method = 'wallet'
  WHERE payment_method IS NULL;
