-- Migration 164: Restructure board subcategories into proper hierarchy
-- Boards > Twintips (parent) > Twintip SLS
-- Boards > Surfboards (parent) > Surfboard SLS, Surfboard DLAB

-- Step 1: Remap Twintip products
-- boards-twintip-standard → boards-twintips (parent level)
UPDATE products SET subcategory = 'boards-twintips' WHERE category = 'kitesurf' AND subcategory = 'boards-twintip-standard';
-- boards-twintip-sls → boards-twintips-sls (child of twintips)
UPDATE products SET subcategory = 'boards-twintips-sls' WHERE category = 'kitesurf' AND subcategory = 'boards-twintip-sls';

-- Step 2: Remap Surfboard products
-- D/LAB surfboards: move to boards-surfboards-dlab
UPDATE products SET subcategory = 'boards-surfboards-dlab' WHERE category = 'kitesurf' AND subcategory = 'boards-surfboard-standard' AND name ILIKE '%D/LAB%';
-- Remaining standard surfboards: move to boards-surfboards (parent level)
UPDATE products SET subcategory = 'boards-surfboards' WHERE category = 'kitesurf' AND subcategory = 'boards-surfboard-standard';
-- SLS surfboards: boards-surfboard-sls → boards-surfboards-sls (child of surfboards)
UPDATE products SET subcategory = 'boards-surfboards-sls' WHERE category = 'kitesurf' AND subcategory = 'boards-surfboard-sls';

-- Step 3: Update product_subcategories table
DELETE FROM product_subcategories WHERE category = 'kitesurf' AND subcategory LIKE 'boards%';

INSERT INTO product_subcategories (category, subcategory, display_name, display_order, is_active, parent_subcategory)
VALUES
  ('kitesurf', 'boards',               'Boards',          3,  true, NULL),
  ('kitesurf', 'boards-twintips',      'Twintips',        1,  true, 'boards'),
  ('kitesurf', 'boards-twintips-sls',  'Twintip SLS',     1,  true, 'boards-twintips'),
  ('kitesurf', 'boards-surfboards',    'Surfboards',      2,  true, 'boards'),
  ('kitesurf', 'boards-surfboards-sls','Surfboard SLS',   1,  true, 'boards-surfboards'),
  ('kitesurf', 'boards-surfboards-dlab','Surfboard DLAB', 2,  true, 'boards-surfboards')
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  parent_subcategory = EXCLUDED.parent_subcategory;
