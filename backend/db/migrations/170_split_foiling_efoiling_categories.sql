-- Migration 170: Split 'efoil' into 'foiling' (traditional) and 'efoil' (electric)
-- 'foiling' gets: wings, masts-fuselages, foils
-- 'efoil'  gets: efoil-boards (renamed from foilassist-boards), efoil-accessories

BEGIN;

-- 1) Move traditional foil products (wings, masts-fuselages) to 'foiling' category
UPDATE products
SET category = 'foiling',
    updated_at = NOW()
WHERE category = 'efoil'
  AND subcategory IN ('wings', 'masts-fuselages', 'foils');

-- 2) Rename foilassist-boards subcategory to efoil-boards for clarity
UPDATE products
SET subcategory = 'efoil-boards',
    updated_at = NOW()
WHERE category = 'efoil'
  AND subcategory = 'foilassist-boards';

-- 3) Sync product_subcategories table — add foiling subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, parent_subcategory, display_order)
VALUES
  ('foiling', 'foils',           'Foils',             NULL, 1),
  ('foiling', 'wings',           'Front & Back Wings', NULL, 2),
  ('foiling', 'masts-fuselages', 'Masts & Fuselages', NULL, 3)
ON CONFLICT (category, subcategory) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      parent_subcategory = EXCLUDED.parent_subcategory,
      display_order = EXCLUDED.display_order;

-- 4) Update efoil subcategories — rename foilassist-boards -> efoil-boards, add efoil-accessories
INSERT INTO product_subcategories (category, subcategory, display_name, parent_subcategory, display_order)
VALUES
  ('efoil', 'efoil-boards',      'E-Foil Boards', NULL, 1),
  ('efoil', 'efoil-accessories', 'Accessories',    NULL, 2)
ON CONFLICT (category, subcategory) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      parent_subcategory = EXCLUDED.parent_subcategory,
      display_order = EXCLUDED.display_order;

-- 5) Remove old efoil subcategories that moved to foiling
DELETE FROM product_subcategories
WHERE category = 'efoil'
  AND subcategory IN ('wings', 'masts-fuselages', 'foils', 'foilassist-boards');

COMMIT;
