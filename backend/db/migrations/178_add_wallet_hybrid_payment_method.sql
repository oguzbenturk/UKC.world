-- Add wallet_hybrid to shop_orders payment_method check constraint
-- Migration: 178_add_wallet_hybrid_payment_method.sql

ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_payment_method_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_payment_method_check
  CHECK (payment_method IN ('wallet', 'credit_card', 'cash', 'wallet_hybrid'));
