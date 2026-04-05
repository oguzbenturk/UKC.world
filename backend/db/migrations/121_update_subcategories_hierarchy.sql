-- Migration 121: Update product subcategories with proper hierarchy
-- Adds board types, bar types, and spare parts subcategories

-- Clear and re-insert with updated structure
DELETE FROM product_subcategories;

INSERT INTO product_subcategories (category, subcategory, display_name, parent_subcategory, display_order) VALUES
    -- Kites subcategories
    ('kites', 'spare-parts', 'Spare Parts', NULL, 1),
    
    -- Boards subcategories (3-level hierarchy)
    ('boards', 'twintip', 'Twintip', NULL, 1),
    ('boards', 'twintip-sls', 'SLS Boards', 'twintip', 2),
    ('boards', 'twintip-standard', 'Standard Boards', 'twintip', 3),
    ('boards', 'surfboard', 'Surf Boards', NULL, 4),
    ('boards', 'surfboard-sls', 'SLS Surf Boards', 'surfboard', 5),
    ('boards', 'surfboard-hybrid', 'Hybrid Surf Boards', 'surfboard', 6),
    ('boards', 'surfboard-standard', 'Standard Surf Boards', 'surfboard', 7),
    ('boards', 'foilboard', 'Foil Boards', NULL, 8),
    ('boards', 'spare-parts', 'Spare Parts', NULL, 9),
    
    -- Wetsuits subcategories (gender > style hierarchy)
    ('wetsuits', 'men', 'Men', NULL, 1),
    ('wetsuits', 'men-shorty', 'Shorty', 'men', 2),
    ('wetsuits', 'men-long', 'Long Arm', 'men', 3),
    ('wetsuits', 'men-fullsuit', 'Full Suit', 'men', 4),
    ('wetsuits', 'women', 'Women', NULL, 5),
    ('wetsuits', 'women-shorty', 'Shorty', 'women', 6),
    ('wetsuits', 'women-long', 'Long Arm', 'women', 7),
    ('wetsuits', 'women-fullsuit', 'Full Suit', 'women', 8),
    ('wetsuits', 'kids', 'Kids', NULL, 9),
    
    -- Harnesses subcategories
    ('harnesses', 'waist', 'Waist', NULL, 1),
    ('harnesses', 'seat', 'Seat', NULL, 2),
    ('harnesses', 'spare-parts', 'Spare Parts', NULL, 3),
    
    -- Bars & Lines subcategories
    ('bars', 'trust-bar', 'Trust Bars', NULL, 1),
    ('bars', 'click-bar', 'Click Bars', NULL, 2),
    ('bars', 'spare-parts', 'Spare Parts', NULL, 3),
    
    -- Equipment subcategories
    ('equipment', 'pumps', 'Pumps', NULL, 1),
    ('equipment', 'repair-kits', 'Repair Kits', NULL, 2),
    ('equipment', 'bags', 'Bags & Cases', NULL, 3),
    ('equipment', 'safety', 'Safety Gear', NULL, 4),
    ('equipment', 'tools', 'Tools', NULL, 5),
    
    -- Accessories subcategories
    ('accessories', 'helmets', 'Helmets', NULL, 1),
    ('accessories', 'gloves', 'Gloves', NULL, 2),
    ('accessories', 'boots', 'Boots', NULL, 3),
    ('accessories', 'sunglasses', 'Sunglasses', NULL, 4),
    ('accessories', 'protection', 'Protection', NULL, 5),
    
    -- Apparel subcategories
    ('apparel', 'men', 'Men', NULL, 1),
    ('apparel', 'women', 'Women', NULL, 2)
ON CONFLICT (category, subcategory) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    parent_subcategory = EXCLUDED.parent_subcategory,
    display_order = EXCLUDED.display_order;
