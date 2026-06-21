-- Per-product "Visible to the Shop/customer" toggle.
-- Migration: 277_add_product_is_visible.sql
--
-- Adds a dedicated visibility flag, independent of `status` (active/inactive,
-- which is the product's lifecycle) and of stock. When false, the product is
-- hidden from the customer-facing storefront (shop listings, by-category) but
-- still fully visible and manageable in admin Shop Management.
--
-- Defaults to TRUE and is NOT NULL, so every existing product stays visible and
-- there is no behaviour change until an admin explicitly hides an item.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN products.is_visible IS
  'When false, the product is hidden from the customer-facing shop (storefront listings / by-category). Admin management still shows it. Independent of status and stock.';

-- Storefront listing queries filter on is_visible; a partial index keeps the
-- common "active + in-stock + visible" shop query fast.
CREATE INDEX IF NOT EXISTS idx_products_visible_active
  ON products (category)
  WHERE is_visible = true AND status = 'active';
