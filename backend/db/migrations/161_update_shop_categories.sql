-- Migration 161: Update shop categories to new hierarchy
-- New category structure: kitesurf, wingfoil, efoil, ion-wetsuits, ion-harnesses, ion-accessories, ukc-shop, secondwind

-- Step 1: Map existing products from old categories to new categories
-- kites → kitesurf (subcategory stays or maps to 'kites')
UPDATE products SET subcategory = 'kites' WHERE category = 'kites' AND (subcategory IS NULL OR subcategory = '' OR subcategory = 'all-kites');
UPDATE products SET category = 'kitesurf' WHERE category = 'kites';

-- boards → kitesurf with subcategory 'boards'
UPDATE products SET subcategory = 'boards' WHERE category = 'boards' AND (subcategory IS NULL OR subcategory = '');
UPDATE products SET category = 'kitesurf' WHERE category = 'boards';

-- bars → kitesurf with subcategory 'bars'
UPDATE products SET subcategory = 'bars' WHERE category = 'bars' AND (subcategory IS NULL OR subcategory = '');
UPDATE products SET category = 'kitesurf' WHERE category = 'bars';

-- equipment, bags, safety, spare-parts → kitesurf with subcategory 'spare-parts'
UPDATE products SET subcategory = 'spare-parts' WHERE category IN ('equipment', 'bags', 'safety', 'spare-parts') AND (subcategory IS NULL OR subcategory = '');
UPDATE products SET category = 'kitesurf' WHERE category IN ('equipment', 'bags', 'safety', 'spare-parts');

-- wing-foil → wingfoil
UPDATE products SET category = 'wingfoil' WHERE category = 'wing-foil';

-- e-foil → efoil
UPDATE products SET category = 'efoil' WHERE category = 'e-foil';

-- wetsuits → ion-wetsuits
UPDATE products SET category = 'ion-wetsuits' WHERE category = 'wetsuits';

-- harnesses → ion-harnesses
UPDATE products SET category = 'ion-harnesses' WHERE category = 'harnesses';

-- accessories → ion-accessories
UPDATE products SET category = 'ion-accessories' WHERE category = 'accessories';

-- apparel → ukc-shop
UPDATE products SET subcategory = CASE
    WHEN subcategory IN ('hoodies', 'men-tops', 'jackets') THEN 'hoodies'
    WHEN subcategory IN ('rashguards', 'boardshorts', 'men-bottoms', 'women-tops', 'women-bottoms') THEN 'tshirts'
    ELSE COALESCE(NULLIF(subcategory, ''), 'tshirts')
END
WHERE category = 'apparel';
UPDATE products SET category = 'ukc-shop' WHERE category = 'apparel';

-- other → secondwind
UPDATE products SET category = 'secondwind' WHERE category = 'other';

-- Step 2: Clear old product_subcategories and insert new hierarchy
DELETE FROM product_subcategories;

INSERT INTO product_subcategories (category, subcategory, display_name, display_order) VALUES
    -- Kitesurf Equipment
    ('kitesurf', 'kites',       'Kites',        1),
    ('kitesurf', 'bars',        'Bars',         2),
    ('kitesurf', 'boards',      'Boards',       3),
    ('kitesurf', 'lines',       'Lines',        4),
    ('kitesurf', 'spare-parts', 'Spare Parts',  5),

    -- WingFoil Equipment
    ('wingfoil', 'wings',  'Wings',  1),
    ('wingfoil', 'boards', 'Boards', 2),
    ('wingfoil', 'foils',  'Foils',  3),

    -- Efoil Equipment
    ('efoil', 'foilassist-boards', 'FoilAssist Boards',   1),
    ('efoil', 'wings',             'Front & Back Wings',   2),
    ('efoil', 'masts-fuselages',   'E-Masts & Fuselages', 3),

    -- ION - Wetsuits (3-level: gender → type)
    ('ion-wetsuits', 'men',              'Men',                     1),
    ('ion-wetsuits', 'men-fullsuits',    'Men - Fullsuits',         2),
    ('ion-wetsuits', 'men-springsuits',  'Men - Springsuits & Shorties', 3),
    ('ion-wetsuits', 'men-all',          'Men - All Wetsuits',      4),
    ('ion-wetsuits', 'women',            'Women',                   5),
    ('ion-wetsuits', 'women-fullsuits',  'Women - Fullsuits',       6),
    ('ion-wetsuits', 'women-springsuits','Women - Springsuits & Shorties', 7),
    ('ion-wetsuits', 'women-all',        'Women - All Wetsuits',    8),

    -- ION - Harnesses
    ('ion-harnesses', 'men',   'Men',   1),
    ('ion-harnesses', 'women', 'Women', 2),

    -- ION - Accessories
    ('ion-accessories', 'ponchos', 'Ponchos',           1),
    ('ion-accessories', 'leashes', 'Leashes',           2),
    ('ion-accessories', 'beach',   'Beach Accessories', 3),

    -- UKC.SHOP
    ('ukc-shop', 'hoodies', 'Hoodies',  1),
    ('ukc-shop', 'ponchos', 'Ponchos',  2),
    ('ukc-shop', 'tshirts', 'T-Shirts', 3),

    -- UKC.SECONDWIND
    ('secondwind', 'kites',  'Kites',        1),
    ('secondwind', 'bars',   'Bars',         2),
    ('secondwind', 'boards', 'Boards',       3),
    ('secondwind', 'sets',   'Set Options',  4)
ON CONFLICT (category, subcategory) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order,
    is_active = true,
    updated_at = NOW();
