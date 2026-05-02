-- 256_add_discount_id_to_wallet_transactions.sql
--
-- Lets us tie a wallet credit/refund-style transaction back to the discount
-- row that created it, so applying a discount on an already-paid entity can
-- (a) credit the customer's wallet for the discount amount, and (b) reverse
-- that credit cleanly when the discount is edited / removed.
--
-- Nullable on purpose: most transactions are NOT discount adjustments.

BEGIN;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS discount_id INTEGER
    REFERENCES discounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_discount_id
  ON wallet_transactions(discount_id)
  WHERE discount_id IS NOT NULL;

COMMIT;
