-- Migration 177: Add gateway_transaction_id to customer_packages
-- Stores the iyzico token so the callback can reliably find the package by token
-- (conversationId in iyzico's response is not always reliably echoed back)

ALTER TABLE customer_packages
  ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(512);

CREATE INDEX IF NOT EXISTS idx_customer_packages_gateway_tx
  ON customer_packages(gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
