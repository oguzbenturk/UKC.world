-- Storage unit number for storage-type offerings
-- Assigned sequentially from 1 to total_capacity when a storage offering is purchased.

ALTER TABLE member_purchases
  ADD COLUMN IF NOT EXISTS storage_unit INT;
