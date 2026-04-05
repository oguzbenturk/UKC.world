-- Migration 119: Add product subcategories system
-- Adds subcategory support for better product organization

-- Add subcategory column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);

-- Create index for subcategory searches
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);
CREATE INDEX IF NOT EXISTS idx_products_category_subcategory ON products(category, subcategory);

-- Create product_subcategories table for predefined hierarchy
CREATE TABLE IF NOT EXISTS product_subcategories (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, subcategory)
);

-- Insert predefined subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order) VALUES
    -- Kites subcategories
    ('kites', 'men', 'Men''s Kites', 1),
    ('kites', 'women', 'Women''s Kites', 2),
    ('kites', 'beginner', 'Beginner Kites', 3),
    ('kites', 'intermediate', 'Intermediate Kites', 4),
    ('kites', 'advanced', 'Advanced Kites', 5),
    ('kites', 'freestyle', 'Freestyle Kites', 6),
    ('kites', 'wave', 'Wave Kites', 7),
    ('kites', 'foil', 'Foil Kites', 8),
    
    -- Boards subcategories
    ('boards', 'twintip', 'Twin Tip Boards', 1),
    ('boards', 'directional', 'Directional Boards', 2),
    ('boards', 'surfboard', 'Surfboards', 3),
    ('boards', 'foilboard', 'Foilboards', 4),
    ('boards', 'beginner', 'Beginner Boards', 5),
    ('boards', 'freestyle', 'Freestyle Boards', 6),
    ('boards', 'freeride', 'Freeride Boards', 7),
    
    -- Wetsuits subcategories
    ('wetsuits', 'men-small', 'Men''s Small', 1),
    ('wetsuits', 'men-medium', 'Men''s Medium', 2),
    ('wetsuits', 'men-large', 'Men''s Large', 3),
    ('wetsuits', 'women-small', 'Women''s Small', 4),
    ('wetsuits', 'women-medium', 'Women''s Medium', 5),
    ('wetsuits', 'women-large', 'Women''s Large', 6),
    ('wetsuits', 'shorty', 'Shorty Wetsuits', 7),
    ('wetsuits', 'fullsuit', 'Full Suits', 8),
    ('wetsuits', 'spring', 'Spring Suits', 9),
    ('wetsuits', 'winter', 'Winter Suits', 10),
    
    -- Harnesses subcategories
    ('harnesses', 'waist', 'Waist Harnesses', 1),
    ('harnesses', 'seat', 'Seat Harnesses', 2),
    ('harnesses', 'men', 'Men''s Harnesses', 3),
    ('harnesses', 'women', 'Women''s Harnesses', 4),
    ('harnesses', 'freestyle', 'Freestyle Harnesses', 5),
    ('harnesses', 'freeride', 'Freeride Harnesses', 6),
    
    -- Bars subcategories
    ('bars', '4-line', '4-Line Bars', 1),
    ('bars', '5-line', '5-Line Bars', 2),
    ('bars', 'beginner', 'Beginner Bars', 3),
    ('bars', 'advanced', 'Advanced Bars', 4),
    ('bars', 'universal', 'Universal Bars', 5),
    
    -- Equipment subcategories
    ('equipment', 'pumps', 'Pumps', 1),
    ('equipment', 'repair-kits', 'Repair Kits', 2),
    ('equipment', 'bags', 'Bags & Cases', 3),
    ('equipment', 'safety', 'Safety Equipment', 4),
    ('equipment', 'accessories', 'Accessories', 5),
    ('equipment', 'tools', 'Tools', 6),
    
    -- Accessories subcategories
    ('accessories', 'helmets', 'Helmets', 1),
    ('accessories', 'gloves', 'Gloves', 2),
    ('accessories', 'boots', 'Boots & Footwear', 3),
    ('accessories', 'sunglasses', 'Sunglasses', 4),
    ('accessories', 'watches', 'Watches & Trackers', 5),
    ('accessories', 'protection', 'Protection Gear', 6),
    
    -- Apparel subcategories
    ('apparel', 'men-tops', 'Men''s Tops', 1),
    ('apparel', 'men-bottoms', 'Men''s Bottoms', 2),
    ('apparel', 'women-tops', 'Women''s Tops', 3),
    ('apparel', 'women-bottoms', 'Women''s Bottoms', 4),
    ('apparel', 'jackets', 'Jackets', 5),
    ('apparel', 'hoodies', 'Hoodies & Sweaters', 6),
    ('apparel', 'rashguards', 'Rashguards', 7),
    ('apparel', 'boardshorts', 'Boardshorts', 8)
ON CONFLICT (category, subcategory) DO NOTHING;

-- Create trigger to update product_subcategories.updated_at
CREATE OR REPLACE FUNCTION update_product_subcategories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_subcategories_updated_at
BEFORE UPDATE ON product_subcategories
FOR EACH ROW
EXECUTE FUNCTION update_product_subcategories_updated_at();

-- Add comment
COMMENT ON COLUMN products.subcategory IS 'Product subcategory for better organization (e.g., men-small, women-large for wetsuits)';
COMMENT ON TABLE product_subcategories IS 'Predefined subcategory hierarchy for product organization';
