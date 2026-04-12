-- Migration 239: Add payment_method to customer_packages
-- Required by the stale pending_payment cleanup job in server.js

ALTER TABLE customer_packages
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
