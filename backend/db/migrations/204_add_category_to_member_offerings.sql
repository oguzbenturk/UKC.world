-- Add category and total_capacity columns to member_offerings
-- category: 'membership' (default) or 'storage'
-- total_capacity: number of available slots (only used for storage)

ALTER TABLE member_offerings
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'membership';

ALTER TABLE member_offerings
  ADD COLUMN IF NOT EXISTS total_capacity INT;

CREATE INDEX IF NOT EXISTS idx_member_offerings_category
  ON member_offerings(category);
