-- Migration 221: Add deposit payment support to shop orders
-- Adds bank_transfer payment method, deposit tracking columns,
-- expanded payment_status values, and shop_order_id FK on bank_transfer_receipts

-- 1. Expand payment_method constraint to include bank_transfer
ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_payment_method_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_payment_method_check
  CHECK (payment_method IN ('wallet', 'credit_card', 'cash', 'wallet_hybrid', 'bank_transfer'));

-- 2. Expand payment_status constraint to include waiting_payment and deposit_paid
ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_payment_status_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_payment_status_check
  CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'waiting_payment', 'deposit_paid'));

-- 3. Add deposit tracking columns
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS deposit_percent SMALLINT DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 0;

-- 4. Add shop_order_id FK to bank_transfer_receipts
ALTER TABLE bank_transfer_receipts
  ADD COLUMN IF NOT EXISTS shop_order_id INTEGER REFERENCES shop_orders(id);

CREATE INDEX IF NOT EXISTS idx_btr_shop_order
  ON bank_transfer_receipts(shop_order_id) WHERE shop_order_id IS NOT NULL;
