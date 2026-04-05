-- Add legacy transaction fields to wallet_transactions for unified ledger
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS booking_id UUID,
  ADD COLUMN IF NOT EXISTS rental_id UUID,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);

-- Backfill newly added columns using existing metadata and relations
UPDATE wallet_transactions
SET payment_method = COALESCE(payment_method, metadata->>'paymentMethod'),
    reference_number = COALESCE(reference_number, metadata->>'referenceNumber')
WHERE payment_method IS NULL
   OR reference_number IS NULL;

UPDATE wallet_transactions
SET booking_id = COALESCE(
      booking_id,
      CASE WHEN related_entity_type = 'booking' THEN related_entity_id ELSE NULL END,
      CASE
        WHEN metadata ? 'bookingId'
         AND (metadata->>'bookingId') ~* '^[0-9a-fA-F-]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
        THEN (metadata->>'bookingId')::uuid
        ELSE NULL
      END
    )
WHERE booking_id IS NULL;

UPDATE wallet_transactions
SET rental_id = COALESCE(
      rental_id,
      CASE WHEN related_entity_type = 'rental' THEN related_entity_id ELSE NULL END,
      CASE
        WHEN metadata ? 'rentalId'
         AND (metadata->>'rentalId') ~* '^[0-9a-fA-F-]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
        THEN (metadata->>'rentalId')::uuid
        ELSE NULL
      END
    )
WHERE rental_id IS NULL;

UPDATE wallet_transactions
SET entity_type = COALESCE(entity_type, related_entity_type, metadata->>'entityType')
WHERE entity_type IS NULL;

UPDATE wallet_transactions
SET exchange_rate = COALESCE(
      exchange_rate,
      CASE
        WHEN metadata ? 'exchangeRate'
         AND (metadata->>'exchangeRate') ~* '^[0-9]+(\.[0-9]+)?$'
        THEN (metadata->>'exchangeRate')::numeric
        ELSE NULL
      END
    )
WHERE exchange_rate IS NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_method ON wallet_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_number ON wallet_transactions(reference_number);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking ON wallet_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_rental ON wallet_transactions(rental_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_entity_type ON wallet_transactions(entity_type);
