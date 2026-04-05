-- Migration: Add original_price column to products table
-- Used to show "before discount" price and populate hot deals / carousel on the shop landing page

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2) DEFAULT NULL;

COMMENT ON COLUMN products.original_price IS 'Original/MSRP price before discount. When set and > price, the product appears as "on sale".';
