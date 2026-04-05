-- Migration: Add variants, colors, gender, sizes, and source_url to products table
-- These fields support products scraped from e-commerce sites with complex options

-- Add new columns for product variants and metadata
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB,
ADD COLUMN IF NOT EXISTS colors JSONB,
ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
ADD COLUMN IF NOT EXISTS sizes JSONB,
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN(variants);
CREATE INDEX IF NOT EXISTS idx_products_colors ON products USING GIN(colors);

-- Add comments for documentation
COMMENT ON COLUMN products.variants IS 'Array of product variants: [{label: "Size 14.0", size_sqm: 14, price: 2319, price_final: 2550.9, cost_price: 1785.63}]';
COMMENT ON COLUMN products.colors IS 'Array of color options: [{code: "C01", name: "yellow", imageCount: 9}]';
COMMENT ON COLUMN products.gender IS 'Product gender category: Men, Women, Unisex (for wetsuits/apparel)';
COMMENT ON COLUMN products.sizes IS 'Simple sizes array for products like boards: ["133", "136", "139"]';
COMMENT ON COLUMN products.source_url IS 'Original product page URL for reference and updates';
