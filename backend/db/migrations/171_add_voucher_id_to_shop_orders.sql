-- Migration: 171_add_voucher_id_to_shop_orders
-- Add voucher_id column to shop_orders to track promo code usage

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES voucher_codes(id) ON DELETE SET NULL;
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(100);

-- Index for quick lookups of orders by voucher
CREATE INDEX IF NOT EXISTS idx_shop_orders_voucher_id ON shop_orders(voucher_id) WHERE voucher_id IS NOT NULL;
