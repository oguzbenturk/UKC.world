-- Add wallet_deduction_data column to shop_orders
-- Stores the exact wallet deduction plan as JSONB
-- Wallet is ONLY deducted after Iyzico callback confirms card payment succeeded
-- Migration: 179_add_pending_wallet_deduction_to_shop_orders.sql

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS wallet_deduction_data JSONB DEFAULT NULL;
