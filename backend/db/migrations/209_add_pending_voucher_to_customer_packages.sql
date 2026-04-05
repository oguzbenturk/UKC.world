-- Defer voucher redemption until Iyzico confirms payment (credit_card package purchases)

ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS pending_voucher_id UUID REFERENCES voucher_codes(id) ON DELETE SET NULL;
ALTER TABLE customer_packages ADD COLUMN IF NOT EXISTS pending_voucher_meta JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_packages_pending_voucher
  ON customer_packages (pending_voucher_id)
  WHERE pending_voucher_id IS NOT NULL;
