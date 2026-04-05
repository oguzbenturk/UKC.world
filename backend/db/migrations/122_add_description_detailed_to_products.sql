-- Migration 122: Add description_detailed column to products table
-- Adds support for long-form product descriptions from vendor scraping

-- Add description_detailed column for extended product information
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS description_detailed TEXT;

-- Create GIN index for full-text search on both descriptions
CREATE INDEX IF NOT EXISTS idx_products_description_search 
ON products USING gin(
    to_tsvector('english', 
        COALESCE(description, '') || ' ' || COALESCE(description_detailed, '')
    )
);

COMMENT ON COLUMN products.description IS 'Short product description for cards and previews (200-300 chars)';
COMMENT ON COLUMN products.description_detailed IS 'Detailed product information from vendor (full specifications, features, etc.)';
