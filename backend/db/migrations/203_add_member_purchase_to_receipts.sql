-- Migration 203: Add member_purchase_id to bank_transfer_receipts
-- Links membership purchases to the bank transfer receipt approval workflow

ALTER TABLE bank_transfer_receipts 
  ADD COLUMN IF NOT EXISTS member_purchase_id INT REFERENCES member_purchases(id);

CREATE INDEX IF NOT EXISTS idx_btr_member_purchase 
  ON bank_transfer_receipts(member_purchase_id) WHERE member_purchase_id IS NOT NULL;
