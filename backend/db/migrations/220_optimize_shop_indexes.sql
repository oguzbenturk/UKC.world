-- 220_optimize_shop_indexes.sql
-- Optimized indexes for shop browse queries (LATERAL join pattern)

-- Covering index for per-category shop queries:
-- WHERE status = 'active' AND category = ? ORDER BY is_featured DESC, created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shop_browse
  ON products (category, is_featured DESC, created_at DESC)
  WHERE status = 'active';

-- Functional index for case-insensitive category lookups (safety net)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_lower
  ON products (LOWER(category));
