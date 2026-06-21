-- Batch 6: set ALL Rashguard LS (incl. the "Rasguard LS" typo listing) to EUR60.
-- Raises the EUR56 listings to EUR60; respects the never-reduce policy.
\set ON_ERROR_STOP on
BEGIN;

\echo '=== Before ==='
SELECT TRIM(name) AS name, price FROM products
WHERE status='active' AND TRIM(name) IN ('Rashguard LS','Rasguard LS') ORDER BY name, price;

UPDATE products SET price = 60
WHERE status='active' AND TRIM(name) IN ('Rashguard LS','Rasguard LS');

UPDATE products p SET variants = sub.nv
FROM (
  SELECT p2.id, (SELECT jsonb_agg(jsonb_set(elem,'{price}', to_jsonb(60::numeric)))
                 FROM jsonb_array_elements(p2.variants) elem) AS nv
  FROM products p2
  WHERE p2.status='active' AND TRIM(p2.name) IN ('Rashguard LS','Rasguard LS')
    AND p2.variants IS NOT NULL AND jsonb_typeof(p2.variants)='array' AND jsonb_array_length(p2.variants)>0
) sub WHERE p.id=sub.id;

\echo '=== After ==='
SELECT TRIM(p.name) AS name, p.price,
       (SELECT min((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmin,
       (SELECT max((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmax
FROM products p
WHERE p.status='active' AND TRIM(p.name) IN ('Rashguard LS','Rasguard LS') ORDER BY name, p.price;

COMMIT;
