ALTER TABLE accommodation_units
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'own';

COMMENT ON COLUMN accommodation_units.category IS 'own = our property, hotel = third-party hotel unit';
