-- Price sync setup: build mapping table, back up current prices, preview changes.
-- Rate: 1 EUR = 53.14 TRY. High-confidence matches only.
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS price_sync_map;
CREATE TABLE price_sync_map (nm text PRIMARY KEY, newprice numeric);

INSERT INTO price_sync_map (nm, newprice) VALUES
  -- Kites / boards / bars
  ('Evo SLS', 2025),
  ('Evo D/Lab', 2682),
  ('Rebel SLS', 2157),
  ('Rebel D/LAB', 3051),
  ('Dice SLS', 1709),
  ('TS Big Air SLS', 1262),
  ('Jaime SLS 2026', 1262),
  ('Select SLS', 1262),
  ('Select Concept Blue', 815),
  ('Soleil SLS', 1262),
  ('Soleil Concept Blue', 815),
  ('DTK-Click Bar Quad Control', 806),
  ('DTK-Trust Bar Quad Control Large', 578),
  ('DTK-Trust Bar Quad Control Medium', 578),
  ('Duotone Chicken Loop Freeride', 87),
  -- Harnesses (ION)
  ('Harness Waist Kite Axxis', 253),
  ('Harness Waist Kite Muse', 284),
  ('Harness Waist Kite Riot Curv', 486),
  ('Harness Waist Kite Rival', 284),
  ('Harness Waist Kite Sol Curv', 486),
  ('IOW-Harness Waist Kite Apex', 385),
  ('IOW-Harness Waist Kite Nova', 385),
  ('IOW-Harness Waist Kite Spectre', 608),
  ('Kite Waist Harness Apex 8', 385),
  -- Wetsuits (ION)
  ('Amaze Core 3/2 Front Zip', 365),
  ('Amaze Core 4/3 Back Zip', 375),
  ('Amaze Hot Shorty 1.5 LS Front Zip', 182),
  ('Amaze Hot Shorty 1.5 LS Frontzip', 182),
  ('Amaze Shorty 2.0 LS Backzip', 182),
  ('Element 2/2 Shorty LS Back Zip', 182),
  ('Element 2/2 Shorty LS Front Zip', 182),
  ('Element 3/2 Front Zip', 274),
  ('Element 5/4 Back Zip', 284),
  ('Wetsuit Element 4/3 Back Zip', 284),
  ('Seek Core 3/2 Front Zip', 314),
  ('Wetsuit Amaze Core 4/3 Back Zip', 375),
  ('IOW Static 3/2 Back Zip', 182),
  ('IOW Static 3/2 Back Zip Women', 193),
  -- Rashguards / neo tops / vests (ION)
  ('Neo Top 0.5 LS', 122),
  ('Neo Top 2/2 LS', 142),
  ('Rashguard Lizz LS', 61),
  ('Rashguard Lizz SS', 61),
  ('Rashguard SS', 51),
  ('Rashguard Promo LS', 51),
  ('Rashguard Maze LS', 66),
  ('Wetshirt Hood LS', 76),
  ('Wetshirt Storm Pro LS', 111),
  ('Hooded Neo West 2/1', 111),
  ('Vest Ivy Front Zip', 172),
  -- Footwear / helmets / poncho (ION)
  ('Plasma Shoes 2.5mm', 66),
  ('IOW - Helmet Slash Amp', 132),
  ('IOW Helmet Slash Amp', 132),
  ('IOW- Helmet Slash Amp', 132),
  ('IOW-Poncho Core', 81);

-- Backup current prices/variants (idempotent: drop+recreate)
DROP TABLE IF EXISTS products_price_backup_20260620;
CREATE TABLE products_price_backup_20260620 AS
  SELECT id, name, price, original_price, variants FROM products;

\echo '=== PREVIEW: rows that will change (matched, active) ==='
SELECT p.category, TRIM(p.name) AS name, p.price AS old_price, map.newprice AS new_price,
       (map.newprice - p.price) AS delta,
       jsonb_array_length(COALESCE(p.variants,'[]'::jsonb)) AS variants
FROM products p
JOIN price_sync_map map ON TRIM(p.name) = map.nm
WHERE p.status='active'
ORDER BY p.category, name, old_price;

\echo '=== Mapping entries that matched NO active product (should be empty) ==='
SELECT map.nm, map.newprice
FROM price_sync_map map
LEFT JOIN products p ON TRIM(p.name) = map.nm AND p.status='active'
WHERE p.id IS NULL;

\echo '=== Summary counts ==='
SELECT count(*) AS rows_to_update,
       count(*) FILTER (WHERE p.price = 0) AS filling_blanks,
       count(*) FILTER (WHERE p.price > 0) AS overwriting_existing
FROM products p JOIN price_sync_map map ON TRIM(p.name)=map.nm AND p.status='active';
