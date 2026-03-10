-- Add gateway_token column to shop_orders
-- Stores the Iyzico checkout token so the callback can find the order
-- The callback uses this token for reliable order lookup
-- Migration: 180_add_gateway_token_to_shop_orders.sql

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS gateway_token TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_shop_orders_gateway_token ON shop_orders(gateway_token) WHERE gateway_token IS NOT NULL;
