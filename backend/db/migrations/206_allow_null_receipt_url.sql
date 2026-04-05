-- Allow NULL receipt_url for deposit-by-card flows where no receipt is uploaded
ALTER TABLE bank_transfer_receipts ALTER COLUMN receipt_url DROP NOT NULL;
