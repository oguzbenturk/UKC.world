-- Migration 237: Add indexes for payment_status filtering on high-traffic tables
-- Prevents full table scans on admin queries filtering by payment status

CREATE INDEX IF NOT EXISTS idx_shop_orders_payment_status
  ON shop_orders(payment_status);

CREATE INDEX IF NOT EXISTS idx_customer_packages_status_customer
  ON customer_packages(status, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_packages_status_created
  ON customer_packages(status, created_at)
  WHERE status IN ('pending_payment', 'waiting_payment');

CREATE INDEX IF NOT EXISTS idx_shop_orders_status_payment
  ON shop_orders(status, payment_status)
  WHERE payment_status IN ('pending_payment', 'waiting_payment');
