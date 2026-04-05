-- Migration 176: Add 'pending_payment' to customer_packages status constraint
-- Allows packages created via credit card to remain in pending state until iyzico confirms payment

ALTER TABLE customer_packages
  DROP CONSTRAINT IF EXISTS check_status_valid;

ALTER TABLE customer_packages
  ADD CONSTRAINT check_status_valid
    CHECK (status IN ('active', 'expired', 'used_up', 'cancelled', 'pending_payment'));
