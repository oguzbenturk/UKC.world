-- Add group_key to member_offerings so that offerings sharing the same
-- group_key are presented as a single card with selectable duration variants.
-- group_key NULL  → standalone card (existing behaviour, no change)
-- group_key 'beach_pass' → all beach-pass tiers collapse into one card

ALTER TABLE member_offerings
  ADD COLUMN IF NOT EXISTS group_key VARCHAR(100) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_member_offerings_group_key
  ON member_offerings (group_key)
  WHERE group_key IS NOT NULL;
