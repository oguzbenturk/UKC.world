-- Batch 2 (medium confidence) setup + preview. Does NOT recreate the backup table.
-- Uses LIKE patterns (handles the Turkish 'Kite' I-dot and the apostrophe name).
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS price_sync_map2;
CREATE TABLE price_sync_map2 (pat text PRIMARY KEY, newprice numeric, note text);

INSERT INTO price_sync_map2 (pat, newprice, note) VALUES
  ('%Jaime SLS 2023%', 822, 'xtremspor 2024 Jaime SLS sale'),
  ('%Jaime Concept Blue%', 832, 'xtremspor 2026 Jaime (entry) board'),
  ('%Short Sleeve Shorty Backzip%', 172, 'xtremspor Element 2/2 Shorty Women'),
  ('%Vest Vector Amp Front Zip%', 193, 'xtremspor Vector Vest Core'),
  ('%Vest Vector Element Side Zip Men%', 193, 'xtremspor Vector Vest Core'),
  ('%Vest Vector Select Front Zip%', 193, 'xtremspor Vector Vest Core'),
  ('%ION Cap%', 51, 'xtremspor ION Surf Cap'),
  ('%Ocean Sunglasses%', 122, 'xtremspor Ocean Chameleon'),
  ('%Apex Curv 13%', 360, 'no xtremspor Curv variant - use recorded RRP'),
  ('%Nova Curv 10%', 340, 'no xtremspor Curv variant - use recorded RRP'),
  ('%Harness Sol 7%', 249, 'no xtremspor Sol 7 - use recorded RRP'),
  ('%Harness Nova 6%', 259, 'no xtremspor current Nova 6 - use recorded RRP');

\echo '=== BATCH 2 PREVIEW: rows that will change ==='
SELECT p.category, p.name, p.price AS old_price, map.newprice AS new_price,
       (map.newprice - p.price) AS delta,
       jsonb_array_length(COALESCE(p.variants,'[]'::jsonb)) AS variants, map.note
FROM products p
JOIN price_sync_map2 map ON p.name LIKE map.pat
WHERE p.status='active'
ORDER BY p.category, p.name, old_price;

\echo '=== Patterns matching NO active product (should be empty) ==='
SELECT map.pat FROM price_sync_map2 map
LEFT JOIN products p ON p.name LIKE map.pat AND p.status='active'
WHERE p.id IS NULL;

\echo '=== Guard: patterns matching MORE than expected (review counts) ==='
SELECT map.pat, count(p.id) AS rows_matched
FROM price_sync_map2 map
LEFT JOIN products p ON p.name LIKE map.pat AND p.status='active'
GROUP BY map.pat ORDER BY rows_matched DESC;
