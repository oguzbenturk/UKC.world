-- Migration 120: Update product subcategories to simplified hierarchy
-- Reorganizes subcategories with parent-child relationships

-- Add parent_subcategory column for hierarchy support
ALTER TABLE product_subcategories 
ADD COLUMN IF NOT EXISTS parent_subcategory VARCHAR(100);

-- Clear old subcategories and insert new simplified hierarchy
DELETE FROM product_subcategories;

INSERT INTO product_subcategories (category, subcategory, display_name, parent_subcategory, display_order) VALUES
    -- Kites subcategories (simplified skill levels)
    ('kites', 'beginner', 'Beginner', NULL, 1),
    ('kites', 'intermediate', 'Intermediate', NULL, 2),
    ('kites', 'advanced', 'Advanced', NULL, 3),
    ('kites', 'freestyle', 'Freestyle', NULL, 4),
    ('kites', 'wave', 'Wave', NULL, 5),
    ('kites', 'foil', 'Foil', NULL, 6),
    
    -- Boards subcategories (simplified board types)
    ('boards', 'twintip', 'Twin Tip', NULL, 1),
    ('boards', 'directional', 'Directional', NULL, 2),
    ('boards', 'surfboard', 'Surfboard', NULL, 3),
    ('boards', 'foilboard', 'Foilboard', NULL, 4),
    
    -- Wetsuits subcategories (hierarchical: gender > style)
    ('wetsuits', 'men', 'Men', NULL, 1),
    ('wetsuits', 'men-shorty', 'Shorty', 'men', 2),
    ('wetsuits', 'men-long', 'Long Arm', 'men', 3),
    ('wetsuits', 'men-fullsuit', 'Full Suit', 'men', 4),
    ('wetsuits', 'women', 'Women', NULL, 5),
    ('wetsuits', 'women-shorty', 'Shorty', 'women', 6),
    ('wetsuits', 'women-long', 'Long Arm', 'women', 7),
    ('wetsuits', 'women-fullsuit', 'Full Suit', 'women', 8),
    ('wetsuits', 'kids', 'Kids', NULL, 9),
    
    -- Harnesses subcategories (simplified)
    ('harnesses', 'waist', 'Waist', NULL, 1),
    ('harnesses', 'seat', 'Seat', NULL, 2),
    ('harnesses', 'men', 'Men', NULL, 3),
    ('harnesses', 'women', 'Women', NULL, 4),
    
    -- Bars subcategories (simplified)
    ('bars', '4-line', '4-Line', NULL, 1),
    ('bars', '5-line', '5-Line', NULL, 2),
    
    -- Equipment subcategories (simplified)
    ('equipment', 'pumps', 'Pumps', NULL, 1),
    ('equipment', 'repair-kits', 'Repair Kits', NULL, 2),
    ('equipment', 'bags', 'Bags & Cases', NULL, 3),
    ('equipment', 'safety', 'Safety Gear', NULL, 4),
    ('equipment', 'tools', 'Tools', NULL, 5),
    
    -- Accessories subcategories (simplified)
    ('accessories', 'helmets', 'Helmets', NULL, 1),
    ('accessories', 'gloves', 'Gloves', NULL, 2),
    ('accessories', 'boots', 'Boots', NULL, 3),
    ('accessories', 'sunglasses', 'Sunglasses', NULL, 4),
    ('accessories', 'protection', 'Protection', NULL, 5),
    
    -- Apparel subcategories (hierarchical: gender > type)
    ('apparel', 'men', 'Men', NULL, 1),
    ('apparel', 'men-tops', 'Tops', 'men', 2),
    ('apparel', 'men-bottoms', 'Bottoms', 'men', 3),
    ('apparel', 'women', 'Women', NULL, 4),
    ('apparel', 'women-tops', 'Tops', 'women', 5),
    ('apparel', 'women-bottoms', 'Bottoms', 'women', 6),
    ('apparel', 'rashguards', 'Rashguards', NULL, 7),
    ('apparel', 'boardshorts', 'Boardshorts', NULL, 8)
ON CONFLICT (category, subcategory) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    parent_subcategory = EXCLUDED.parent_subcategory,
    display_order = EXCLUDED.display_order;

-- Create index for parent lookups
CREATE INDEX IF NOT EXISTS idx_product_subcategories_parent ON product_subcategories(category, parent_subcategory);
