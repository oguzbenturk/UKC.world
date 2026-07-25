-- Migration 289: allow 'card' as a shop_orders payment method
--
-- The New Sale "Paid" flow records an in-person card-terminal payment as
-- payment_method 'card' — deliberately distinct from 'credit_card', which is the
-- Iyzico ONLINE gateway (deferred, gateway_token, callback-settled). The existing
-- CHECK constraint (migration 221) omitted 'card', so every staff card sale failed
-- at INSERT with a constraint violation surfaced to the UI as "Failed to create
-- order" — while cash (already allowed) and bank_transfer worked. Add 'card'.
--
-- ('card' pairs with the cash/bank_transfer instant-paid branch in
-- backend/routes/shopOrders.js: order confirms as paid + a zero-delta
-- shop_order_charge/card_payment ledger pair; no gateway is involved.)

ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_payment_method_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_payment_method_check
  CHECK (payment_method IN ('wallet', 'credit_card', 'card', 'cash', 'wallet_hybrid', 'bank_transfer'));
