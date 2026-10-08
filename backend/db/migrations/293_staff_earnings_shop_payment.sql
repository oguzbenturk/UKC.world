-- Migration 293: "Pay with my earnings" at shop checkout (staff wallet, 2026-10-08)
--
-- Instructors / managers can pay a shop order from earnings not yet paid out.
-- The order is stored with payment_method 'earnings' and the spend is a normal
-- staff payout row in wallet_transactions (entity_type instructor_payment /
-- manager_payment, transaction_type 'payment', payment_method 'earnings',
-- available_delta 0, metadata.sourceType/sourceId = the order) — see
-- backend/services/staffEarningsService.js and backend/routes/shopOrders.js.
--
-- 1. Allow 'earnings' on shop_orders.payment_method (list from migration 289).
-- 2. One live earnings spend per source (idempotency): a retried or doubled
--    checkout for the same order cannot write a second spend row. Cancelled rows
--    (refunds) are excluded, so the history stays.

ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_payment_method_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_payment_method_check
  CHECK (payment_method IN ('wallet', 'credit_card', 'card', 'cash', 'wallet_hybrid', 'bank_transfer', 'earnings'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_staff_earnings_spend_source
  ON wallet_transactions ((metadata->>'sourceType'), (metadata->>'sourceId'))
  WHERE payment_method = 'earnings'
    AND transaction_type = 'payment'
    AND entity_type IN ('instructor_payment', 'manager_payment')
    AND status <> 'cancelled';
