-- Apply price sync (requires price_sync_map from price-sync-setup.sql to exist).
\set ON_ERROR_STOP on
BEGIN;

-- 1) Base price
UPDATE products p
SET price = map.newprice
FROM price_sync_map map
WHERE TRIM(p.name) = map.nm AND p.status = 'active';

-- 2) Flatten each matched product's variant prices to the new price
UPDATE products p
SET variants = sub.nv
FROM (
  SELECT p2.id,
         (SELECT jsonb_agg(jsonb_set(elem, '{price}', to_jsonb(map.newprice)))
          FROM jsonb_array_elements(p2.variants) elem) AS nv
  FROM products p2
  JOIN price_sync_map map ON TRIM(p2.name) = map.nm
  WHERE p2.status = 'active'
    AND p2.variants IS NOT NULL
    AND jsonb_typeof(p2.variants) = 'array'
    AND jsonb_array_length(p2.variants) > 0
) sub
WHERE p.id = sub.id;

-- 3) Clear broken compare-at prices (original_price <= new price)
UPDATE products p
SET original_price = NULL
FROM price_sync_map map
WHERE TRIM(p.name) = map.nm AND p.status = 'active'
  AND p.original_price IS NOT NULL AND p.original_price <= p.price;

\echo '=== Verify: base price applied (should equal 62) ==='
SELECT count(*) AS base_ok
FROM products p JOIN price_sync_map map ON TRIM(p.name)=map.nm AND p.status='active'
WHERE p.price = map.newprice;

\echo '=== Verify: variant prices now match base (sample) ==='
SELECT TRIM(p.name) AS name, p.price,
       (SELECT min((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmin,
       (SELECT max((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmax
FROM products p JOIN price_sync_map map ON TRIM(p.name)=map.nm AND p.status='active'
WHERE p.variants IS NOT NULL AND jsonb_array_length(p.variants) > 0
ORDER BY p.category, name
LIMIT 12;

\echo '=== Verify: any variant still mismatching base (should be 0) ==='
SELECT count(*) AS mismatched
FROM products p JOIN price_sync_map map ON TRIM(p.name)=map.nm AND p.status='active'
WHERE p.variants IS NOT NULL AND jsonb_array_length(p.variants) > 0
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.variants) v
              WHERE (v->>'price')::numeric IS DISTINCT FROM p.price);

COMMIT;
