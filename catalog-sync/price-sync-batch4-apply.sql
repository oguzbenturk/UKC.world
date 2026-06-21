-- Batch 4: shorty 2.5 suits (proxy from Amaze Shorty 2.0 = EUR182) + missed Seek 4/3 BZ listing.
\set ON_ERROR_STOP on
BEGIN;

DROP TABLE IF EXISTS price_sync_map4;
CREATE TABLE price_sync_map4 (nm text PRIMARY KEY, newprice numeric);
INSERT INTO price_sync_map4 (nm, newprice) VALUES
  ('Amaze Shorty 2.5 SS Back Zip', 182),         -- xtremspor has Shorty 2.0 = 182 (no 2.5)
  ('Wetsuit Amaze Shorty 2.5 SS Back Zip', 182),
  ('Seek Core 4/3 Back Zip', 367);               -- match its already-priced siblings

\echo '=== Before ==='
SELECT TRIM(p.name) AS name, p.price FROM products p JOIN price_sync_map4 m ON TRIM(p.name)=m.nm WHERE p.status='active' ORDER BY name, p.price;

UPDATE products p SET price = m.newprice
FROM price_sync_map4 m WHERE TRIM(p.name)=m.nm AND p.status='active';

UPDATE products p SET variants = sub.nv
FROM (
  SELECT p2.id, (SELECT jsonb_agg(jsonb_set(elem,'{price}', to_jsonb(m.newprice)))
                 FROM jsonb_array_elements(p2.variants) elem) AS nv
  FROM products p2 JOIN price_sync_map4 m ON TRIM(p2.name)=m.nm
  WHERE p2.status='active' AND p2.variants IS NOT NULL
    AND jsonb_typeof(p2.variants)='array' AND jsonb_array_length(p2.variants)>0
) sub WHERE p.id=sub.id;

\echo '=== After ==='
SELECT TRIM(p.name) AS name, p.price FROM products p JOIN price_sync_map4 m ON TRIM(p.name)=m.nm WHERE p.status='active' ORDER BY name, p.price;

DROP TABLE price_sync_map4;
COMMIT;
