-- Apply batch 2 (medium confidence). Requires price_sync_map2 from batch2-setup.
\set ON_ERROR_STOP on
BEGIN;

UPDATE products p
SET price = map.newprice
FROM price_sync_map2 map
WHERE p.name LIKE map.pat AND p.status='active';

UPDATE products p
SET variants = sub.nv
FROM (
  SELECT p2.id,
         (SELECT jsonb_agg(jsonb_set(elem, '{price}', to_jsonb(map.newprice)))
          FROM jsonb_array_elements(p2.variants) elem) AS nv
  FROM products p2
  JOIN price_sync_map2 map ON p2.name LIKE map.pat
  WHERE p2.status='active'
    AND p2.variants IS NOT NULL
    AND jsonb_typeof(p2.variants)='array'
    AND jsonb_array_length(p2.variants) > 0
) sub
WHERE p.id = sub.id;

UPDATE products p
SET original_price = NULL
FROM price_sync_map2 map
WHERE p.name LIKE map.pat AND p.status='active'
  AND p.original_price IS NOT NULL AND p.original_price <= p.price;

\echo '=== Verify base applied (expect 14) ==='
SELECT count(*) AS base_ok
FROM products p JOIN price_sync_map2 map ON p.name LIKE map.pat AND p.status='active'
WHERE p.price = map.newprice;

\echo '=== Verify variants match base (expect 0 mismatches) ==='
SELECT count(*) AS mismatched
FROM products p JOIN price_sync_map2 map ON p.name LIKE map.pat AND p.status='active'
WHERE p.variants IS NOT NULL AND jsonb_array_length(p.variants) > 0
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.variants) v
              WHERE (v->>'price')::numeric IS DISTINCT FROM p.price);

COMMIT;
DROP TABLE IF EXISTS price_sync_map2;
