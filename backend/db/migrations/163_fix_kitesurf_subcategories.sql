-- Migration 163: Fix kitesurf subcategories to follow parent-child naming convention
-- This enables hierarchical filtering (e.g., clicking "Boards" shows all board types)

-- Rename bar subcategories: trust-bar → bars-trust, click-bar → bars-click
UPDATE products SET subcategory = 'bars-trust' WHERE category = 'kitesurf' AND subcategory = 'trust-bar';
UPDATE products SET subcategory = 'bars-click' WHERE category = 'kitesurf' AND subcategory = 'click-bar';

-- Rename board subcategories to start with boards-
UPDATE products SET subcategory = 'boards-twintip-standard' WHERE category = 'kitesurf' AND subcategory = 'twintip-standard';
UPDATE products SET subcategory = 'boards-twintip-sls' WHERE category = 'kitesurf' AND subcategory = 'twintip-sls';
UPDATE products SET subcategory = 'boards-surfboard-standard' WHERE category = 'kitesurf' AND subcategory = 'surfboard-standard';
UPDATE products SET subcategory = 'boards-surfboard-sls' WHERE category = 'kitesurf' AND subcategory = 'surfboard-sls';

-- board-bags stays as top-level (not a board type, it's an accessory)
-- spare-parts stays as is
-- kites stays as is

-- Update product_subcategories table
DELETE FROM product_subcategories WHERE category = 'kitesurf';

INSERT INTO product_subcategories (category, subcategory, display_name, display_order, is_active, parent_subcategory)
VALUES
  -- Top-level subcategories
  ('kitesurf', 'kites',                    'Kites',               1,  true, NULL),
  ('kitesurf', 'bars',                     'Bars',                2,  true, NULL),
  ('kitesurf', 'bars-trust',               'Trust Bar',           1,  true, 'bars'),
  ('kitesurf', 'bars-click',               'Click Bar',           2,  true, 'bars'),
  ('kitesurf', 'boards',                   'Boards',              3,  true, NULL),
  ('kitesurf', 'boards-twintip-standard',  'TwinTip Standard',    1,  true, 'boards'),
  ('kitesurf', 'boards-twintip-sls',       'TwinTip SLS',         2,  true, 'boards'),
  ('kitesurf', 'boards-surfboard-standard','Surfboard Standard',  3,  true, 'boards'),
  ('kitesurf', 'boards-surfboard-sls',     'Surfboard SLS',       4,  true, 'boards'),
  ('kitesurf', 'board-bags',               'Board Bags',          4,  true, NULL),
  ('kitesurf', 'spare-parts',              'Spare Parts',         5,  true, NULL)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  parent_subcategory = EXCLUDED.parent_subcategory;
