-- Migration 169: Sync product_subcategories table with frontend productCategories.js constants
-- This ensures the DB table matches the single source of truth used by the sidebar tree.

BEGIN;

-- Clear existing subcategories and re-insert from the definitive list
DELETE FROM product_subcategories;

-- kitesurf subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('kitesurf', 'kites',              'Kites',              1,  NULL,          true),
  ('kitesurf', 'bars',               'Control Bars',       2,  NULL,          true),
  ('kitesurf', 'bars-trust',         'Trust Bar',          3,  'bars',        true),
  ('kitesurf', 'bars-click',         'Click Bar',          4,  'bars',        true),
  ('kitesurf', 'boards',             'Boards',             5,  NULL,          true),
  ('kitesurf', 'boards-twintips',    'Twintips',           6,  'boards',      true),
  ('kitesurf', 'boards-surfboards',  'Surfboards',         7,  'boards',      true),
  ('kitesurf', 'boards-foilboards',  'Foilboards',         8,  'boards',      true),
  ('kitesurf', 'accessories',        'Accessories',        9,  NULL,          true),
  ('kitesurf', 'board-bags',         'Board Bags',         10, 'accessories', true),
  ('kitesurf', 'spare-parts',        'Spare Parts',        11, 'accessories', true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- wingfoil subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('wingfoil', 'wings',  'Wings',  1, NULL, true),
  ('wingfoil', 'boards', 'Boards', 2, NULL, true),
  ('wingfoil', 'foils',  'Foils',  3, NULL, true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- efoil (Foiling) subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('efoil', 'foilassist-boards', 'FoilAssist Boards',  1, NULL, true),
  ('efoil', 'wings',             'Front & Back Wings',  2, NULL, true),
  ('efoil', 'masts-fuselages',   'Masts & Fuselages',   3, NULL, true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- ion (ION Water) subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('ion', 'wetsuits',                   'Wetsuits',                1,  NULL,            true),
  ('ion', 'wetsuits-men',               'Men',                     2,  'wetsuits',      true),
  ('ion', 'wetsuits-men-fullsuits',     'Fullsuits',               3,  'wetsuits-men',  true),
  ('ion', 'wetsuits-men-springsuits',   'Springsuits & Shorties',  4,  'wetsuits-men',  true),
  ('ion', 'wetsuits-women',             'Women',                   5,  'wetsuits',      true),
  ('ion', 'wetsuits-women-fullsuits',   'Fullsuits',               6,  'wetsuits-women', true),
  ('ion', 'wetsuits-women-springsuits', 'Springsuits & Shorties',  7,  'wetsuits-women', true),
  ('ion', 'protection',                 'Protection',              8,  NULL,            true),
  ('ion', 'protection-men',             'Men',                     9,  'protection',    true),
  ('ion', 'protection-women',           'Women',                   10, 'protection',    true),
  ('ion', 'harnesses',                  'Harnesses',               11, NULL,            true),
  ('ion', 'harnesses-kite',             'Kite Harnesses',          12, 'harnesses',     true),
  ('ion', 'harnesses-wing',             'Wing Harnesses',          13, 'harnesses',     true),
  ('ion', 'apparel',                    'Water Apparel',           14, NULL,            true),
  ('ion', 'apparel-tops',               'Neo Tops & Rashguards',   15, 'apparel',       true),
  ('ion', 'apparel-ponchos',            'Ponchos',                 16, 'apparel',       true),
  ('ion', 'footwear',                   'Footwear',                17, NULL,            true),
  ('ion', 'ion-accs',                   'Accessories',             18, NULL,            true),
  ('ion', 'ion-accs-leash',             'Leashes',                 19, 'ion-accs',      true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- ukc-shop subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('ukc-shop', 'hoodies', 'Hoodies',  1, NULL, true),
  ('ukc-shop', 'ponchos', 'Ponchos',  2, NULL, true),
  ('ukc-shop', 'tshirts', 'T-Shirts', 3, NULL, true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- secondwind subcategories
INSERT INTO product_subcategories (category, subcategory, display_name, display_order, parent_subcategory, is_active) VALUES
  ('secondwind', 'kites',  'Kites',       1, NULL, true),
  ('secondwind', 'bars',   'Bars',        2, NULL, true),
  ('secondwind', 'boards', 'Boards',      3, NULL, true),
  ('secondwind', 'wings',  'Wings',       4, NULL, true),
  ('secondwind', 'foils',  'Foils',       5, NULL, true),
  ('secondwind', 'sets',   'Set Options', 6, NULL, true)
ON CONFLICT (category, subcategory) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  parent_subcategory = EXCLUDED.parent_subcategory,
  is_active = true,
  updated_at = NOW();

-- Deactivate any rows that are NOT in the above canonical set
-- (leftover from old migrations that no longer match the frontend constants)
UPDATE product_subcategories
SET is_active = false, updated_at = NOW()
WHERE (category, subcategory) NOT IN (
  -- kitesurf
  ('kitesurf','kites'),('kitesurf','bars'),('kitesurf','bars-trust'),('kitesurf','bars-click'),
  ('kitesurf','boards'),('kitesurf','boards-twintips'),('kitesurf','boards-surfboards'),('kitesurf','boards-foilboards'),
  ('kitesurf','accessories'),('kitesurf','board-bags'),('kitesurf','spare-parts'),
  -- wingfoil
  ('wingfoil','wings'),('wingfoil','boards'),('wingfoil','foils'),
  -- efoil
  ('efoil','foilassist-boards'),('efoil','wings'),('efoil','masts-fuselages'),
  -- ion
  ('ion','wetsuits'),('ion','wetsuits-men'),('ion','wetsuits-men-fullsuits'),('ion','wetsuits-men-springsuits'),
  ('ion','wetsuits-women'),('ion','wetsuits-women-fullsuits'),('ion','wetsuits-women-springsuits'),
  ('ion','protection'),('ion','protection-men'),('ion','protection-women'),
  ('ion','harnesses'),('ion','harnesses-kite'),('ion','harnesses-wing'),
  ('ion','apparel'),('ion','apparel-tops'),('ion','apparel-ponchos'),
  ('ion','footwear'),('ion','ion-accs'),('ion','ion-accs-leash'),
  -- ukc-shop
  ('ukc-shop','hoodies'),('ukc-shop','ponchos'),('ukc-shop','tshirts'),
  -- secondwind
  ('secondwind','kites'),('secondwind','bars'),('secondwind','boards'),
  ('secondwind','wings'),('secondwind','foils'),('secondwind','sets')
);

COMMIT;
