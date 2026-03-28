-- Migration 200: Add 'waiting_payment' to customer_packages status constraint
-- Allows packages purchased via bank transfer to start in waiting_payment state
-- until an admin confirms the receipt. The student can still schedule sessions
-- while waiting for admin approval.

ALTER TABLE customer_packages
  DROP CONSTRAINT IF EXISTS check_status_valid;

ALTER TABLE customer_packages
  ADD CONSTRAINT check_status_valid
    CHECK (status IN ('active', 'expired', 'used_up', 'cancelled', 'pending_payment', 'waiting_payment'));
