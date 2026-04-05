-- Migration 166: Pro Center Category Cleanup
-- Aligns category labels and subcategories with official Duotone Pro Center structure
-- Labels: Kiteboarding, Wing Foiling, Foiling, ION Water, SecondWind
-- Flattens SLS/DLAB construction variants into parent subcategories
-- Moves "daily-wear" items into ION "apparel" subcategory

-- 1. Flatten SLS/DLAB subcategories into their parents
-- Products tagged as 'boards-twintips-sls' → 'boards-twintips'
UPDATE products SET subcategory = 'boards-twintips'
WHERE category = 'kitesurf' AND subcategory = 'boards-twintips-sls';

-- Products tagged as 'boards-surfboards-dlab' → 'boards-surfboards'  
UPDATE products SET subcategory = 'boards-surfboards'
WHERE category = 'kitesurf' AND subcategory = 'boards-surfboards-dlab';

-- Add 'SLS' or 'D/LAB' to tags for searchability (only if not already tagged)
UPDATE products 
SET tags = COALESCE(tags, '[]'::jsonb) || '["SLS"]'::jsonb
WHERE category = 'kitesurf' 
  AND subcategory = 'boards-twintips'
  AND NOT (COALESCE(tags, '[]'::jsonb) @> '["SLS"]'::jsonb);

UPDATE products 
SET tags = COALESCE(tags, '[]'::jsonb) || '["D/LAB"]'::jsonb
WHERE category = 'kitesurf' 
  AND subcategory = 'boards-surfboards'
  AND NOT (COALESCE(tags, '[]'::jsonb) @> '["D/LAB"]'::jsonb);

-- 2. Migrate "daily-wear" subcategory to ION "apparel"
UPDATE products SET subcategory = 'apparel'
WHERE category = 'ion' AND subcategory = 'daily-wear';

UPDATE products SET subcategory = 'apparel-tops'
WHERE category = 'ion' AND subcategory IN ('daily-wear-men', 'daily-wear-women');

-- 3. Update product_subcategories table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_subcategories') THEN
    -- Remove old SLS/DLAB subcategories
    DELETE FROM product_subcategories 
    WHERE subcategory IN ('boards-twintips-sls', 'boards-surfboards-dlab');
    
    -- Remove old daily-wear subcategories (now under apparel)
    DELETE FROM product_subcategories 
    WHERE subcategory IN ('daily-wear', 'daily-wear-men', 'daily-wear-women');
    
    -- Insert new ION subcategories if they don't exist
    INSERT INTO product_subcategories (category, subcategory, display_name, display_order, is_active)
    VALUES
      ('ion', 'harnesses',      'Harnesses',             5, true),
      ('ion', 'harnesses-kite', 'Kite Harnesses',        6, true),
      ('ion', 'harnesses-wing', 'Wing Harnesses',        7, true),
      ('ion', 'apparel',        'Water Apparel',         8, true),
      ('ion', 'apparel-tops',   'Neo Tops & Rashguards', 9, true),
      ('ion', 'apparel-ponchos','Ponchos',              10, true),
      ('ion', 'footwear',       'Footwear',             11, true)
    ON CONFLICT (category, subcategory) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      is_active = true;
    
    -- Insert kiteboarding subcategories
    INSERT INTO product_subcategories (category, subcategory, display_name, display_order, is_active)
    VALUES
      ('kitesurf', 'harnesses',     'Harnesses',    7, true),
      ('kitesurf', 'accessories',   'Accessories',  8, true),
      ('kitesurf', 'boards-foilboards', 'Foilboards', 6, true)
    ON CONFLICT (category, subcategory) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      is_active = true;

    -- Add wings and foils to secondwind
    INSERT INTO product_subcategories (category, subcategory, display_name, display_order, is_active)
    VALUES
      ('secondwind', 'wings', 'Wings', 5, true),
      ('secondwind', 'foils', 'Foils', 6, true)
    ON CONFLICT (category, subcategory) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      is_active = true;
  END IF;
END $$;
