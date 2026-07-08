-- 286_add_spare_parts_payment.sql
-- Add payment tracking to spare_parts_orders so staff can record the cost of an
-- ordered part and mark whether it has been paid or not. Cost is stored per-row
-- with an explicit currency (the shop is multi-currency, default EUR) so totals
-- can be grouped without assuming a single currency. paid_at is set when a row
-- is flipped to 'paid' and cleared when it goes back to 'unpaid'.

BEGIN;

ALTER TABLE spare_parts_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(12, 2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS spare_parts_orders_payment_status_idx
  ON spare_parts_orders(payment_status);

COMMIT;
