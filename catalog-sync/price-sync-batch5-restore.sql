-- Batch 5: price-floor restore. No price (base or variant) may sit below the pre-change
-- backup. Restores reductions to original; keeps all increases and 0->price fills.
\set ON_ERROR_STOP on
BEGIN;

\echo '=== Base prices that will be restored (current -> original) ==='
SELECT TRIM(b.name) AS name, p.price AS current, b.price AS restore_to
FROM products p JOIN products_price_backup_20260620 b ON p.id=b.id
WHERE p.price < b.price ORDER BY name, p.price;

-- 1) Base floor
UPDATE products p
SET price = b.price
FROM products_price_backup_20260620 b
WHERE p.id = b.id AND p.price < b.price;

-- 2) Variant floor (per-index: restore any variant price below its original)
UPDATE products p
SET variants = z.newvar
FROM (
  SELECT p2.id,
         jsonb_agg(
           CASE WHEN (bv.elem->>'price') IS NOT NULL AND (cv.elem->>'price') IS NOT NULL
                     AND (bv.elem->>'price')::numeric > (cv.elem->>'price')::numeric
                THEN jsonb_set(cv.elem, '{price}', bv.elem->'price')
                ELSE cv.elem END
           ORDER BY cv.ord) AS newvar
  FROM products p2
  JOIN products_price_backup_20260620 b ON b.id = p2.id
  JOIN LATERAL jsonb_array_elements(p2.variants) WITH ORDINALITY AS cv(elem, ord) ON true
  LEFT JOIN LATERAL jsonb_array_elements(b.variants) WITH ORDINALITY AS bv(elem, ord) ON bv.ord = cv.ord
  WHERE p2.variants IS NOT NULL AND jsonb_typeof(p2.variants)='array' AND jsonb_array_length(p2.variants) > 0
  GROUP BY p2.id
) z
WHERE p.id = z.id AND p.variants IS DISTINCT FROM z.newvar;

\echo '=== Verify: base prices still below backup (must be 0) ==='
SELECT count(*) AS base_below
FROM products p JOIN products_price_backup_20260620 b ON p.id=b.id WHERE p.price < b.price;

\echo '=== Verify: variant prices still below backup (must be 0) ==='
SELECT count(*) AS variant_below
FROM products p JOIN products_price_backup_20260620 b ON p.id=b.id
JOIN LATERAL jsonb_array_elements(p.variants) WITH ORDINALITY AS cv(elem,ord) ON true
JOIN LATERAL jsonb_array_elements(b.variants) WITH ORDINALITY AS bv(elem,ord) ON bv.ord=cv.ord
WHERE (cv.elem->>'price') IS NOT NULL AND (bv.elem->>'price') IS NOT NULL
  AND (cv.elem->>'price')::numeric < (bv.elem->>'price')::numeric;

\echo '=== Affected items after restore ==='
SELECT TRIM(p.name) AS name, p.price,
       (SELECT min((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmin,
       (SELECT max((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmax
FROM products p
WHERE TRIM(p.name) IN ('Vest Vector Amp Front Zip','Element 3/2 Front Zip','Rashguard LS','Rashguard Maze LS')
ORDER BY name, p.price;

COMMIT;
