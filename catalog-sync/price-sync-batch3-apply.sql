-- Batch 3: Entity Ergo set + generic rashguards. Backup table already holds originals.
\set ON_ERROR_STOP on
BEGIN;

DROP TABLE IF EXISTS price_sync_map3;
CREATE TABLE price_sync_map3 (nm text PRIMARY KEY, newprice numeric);
INSERT INTO price_sync_map3 (nm, newprice) VALUES
  ('Binding Entity Ergo', 262),   -- 2026 Duotone Entity Ergo Set 13933.40 TRY / 53.14
  ('Rashguard LS', 56),           -- ION Rashguard LS Men 2961.75 TRY / 53.14
  ('Rasguard LS', 56);            -- same model (typo spelling)

\echo '=== Before ==='
SELECT name, price FROM products p JOIN price_sync_map3 m ON TRIM(p.name)=m.nm WHERE p.status='active' ORDER BY name, price;

UPDATE products p SET price = m.newprice
FROM price_sync_map3 m WHERE TRIM(p.name)=m.nm AND p.status='active';

UPDATE products p SET variants = sub.nv
FROM (
  SELECT p2.id, (SELECT jsonb_agg(jsonb_set(elem,'{price}', to_jsonb(m.newprice)))
                 FROM jsonb_array_elements(p2.variants) elem) AS nv
  FROM products p2 JOIN price_sync_map3 m ON TRIM(p2.name)=m.nm
  WHERE p2.status='active' AND p2.variants IS NOT NULL
    AND jsonb_typeof(p2.variants)='array' AND jsonb_array_length(p2.variants)>0
) sub WHERE p.id=sub.id;

\echo '=== After (base + variant range) ==='
SELECT TRIM(p.name) AS name, p.price,
       (SELECT min((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmin,
       (SELECT max((v->>'price')::numeric) FROM jsonb_array_elements(p.variants) v) AS vmax
FROM products p JOIN price_sync_map3 m ON TRIM(p.name)=m.nm AND p.status='active'
ORDER BY name, p.price;

DROP TABLE price_sync_map3;
COMMIT;
