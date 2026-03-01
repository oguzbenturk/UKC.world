-- Migration 162: Merge ION categories (ion-wetsuits, ion-harnesses, ion-accessories) into single 'ion' category
-- Also remap subcategories to new hierarchical naming scheme

BEGIN;

-- 1. Remap ion-wetsuits products → ion with updated subcategory names
UPDATE products SET
  category = 'ion',
  subcategory = CASE subcategory
    WHEN 'men'             THEN 'wetsuits-men'
    WHEN 'men-fullsuits'   THEN 'wetsuits-men-fullsuits'
    WHEN 'men-springsuits' THEN 'wetsuits-men-springsuits'
    WHEN 'men-all'         THEN 'wetsuits-men'
    WHEN 'women'           THEN 'wetsuits-women'
    WHEN 'women-fullsuits' THEN 'wetsuits-women-fullsuits'
    WHEN 'women-springsuits' THEN 'wetsuits-women-springsuits'
    WHEN 'women-all'       THEN 'wetsuits-women'
    ELSE 'wetsuits'
  END
WHERE category = 'ion-wetsuits';

-- 2. Remap ion-harnesses products → ion with 'protection-*' subcategories
UPDATE products SET
  category = 'ion',
  subcategory = CASE subcategory
    WHEN 'men'   THEN 'protection-men'
    WHEN 'women' THEN 'protection-women'
    ELSE 'protection'
  END
WHERE category = 'ion-harnesses';

-- 3. Remap ion-accessories products → ion with 'ion-accs-*' subcategories
UPDATE products SET
  category = 'ion',
  subcategory = CASE subcategory
    WHEN 'leashes' THEN 'ion-accs-leash'
    WHEN 'ponchos' THEN 'ion-accs'
    WHEN 'beach'   THEN 'ion-accs'
    ELSE 'ion-accs'
  END
WHERE category = 'ion-accessories';

-- 4. Rebuild product_subcategories table with new ION hierarchy
DELETE FROM product_subcategories WHERE category IN ('ion-wetsuits', 'ion-harnesses', 'ion-accessories');

INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory) VALUES
  -- ION - Wetsuits tree
  ('ion', 'wetsuits',                    'Wetsuits',              1,  NULL),
  ('ion', 'wetsuits-men',                'Men',                   2,  'wetsuits'),
  ('ion', 'wetsuits-men-fullsuits',      'FullSuits',             3,  'wetsuits-men'),
  ('ion', 'wetsuits-men-springsuits',    'Springsuits & Shorties',4,  'wetsuits-men'),
  ('ion', 'wetsuits-women',              'Women',                 5,  'wetsuits'),
  ('ion', 'wetsuits-women-fullsuits',    'FullSuits',             6,  'wetsuits-women'),
  ('ion', 'wetsuits-women-springsuits',  'Springsuits & Shorties',7,  'wetsuits-women'),
  -- ION - Protection
  ('ion', 'protection',                  'Protection',            8,  NULL),
  ('ion', 'protection-men',              'Men',                   9,  'protection'),
  ('ion', 'protection-women',            'Women',                 10, 'protection'),
  -- ION - Daily Wear
  ('ion', 'daily-wear',                  'Daily Wear',            11, NULL),
  ('ion', 'daily-wear-men',              'Men',                   12, 'daily-wear'),
  ('ion', 'daily-wear-women',            'Women',                 13, 'daily-wear'),
  -- ION - ION Accs
  ('ion', 'ion-accs',                    'ION Accs',              14, NULL),
  ('ion', 'ion-accs-leash',              'Leash',                 15, 'ion-accs')
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory;

-- 5. Rename kitesurf label in product_subcategories (cosmetic — frontend handles labels, but keep DB consistent)
-- No action needed — the product_subcategories table stores category/subcategory values, not labels.

COMMIT;
