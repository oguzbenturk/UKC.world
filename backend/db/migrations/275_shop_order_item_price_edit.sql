-- Allow admins to edit a shop order line-item's price after the sale.
-- Migration: 275_shop_order_item_price_edit.sql
--
-- Many shop products are sold with no price set (price added after the sale).
-- Staff can now edit shop_order_items.unit_price from the customer drawer.
-- We preserve the FIRST agreed unit_price the first time a line is edited so
-- the original price stays visible for audit/bills — mirrors the
-- customer_packages.original_price pattern used by the package price edit.
--
-- NOTE: this is the only schema change the feature needs. The editable value
-- (unit_price / total_price) and the order's denormalised totals (subtotal /
-- total_amount) already exist on shop_order_items / shop_orders.

ALTER TABLE shop_order_items
  ADD COLUMN IF NOT EXISTS original_unit_price DECIMAL(10, 2);

COMMENT ON COLUMN shop_order_items.original_unit_price IS
  'The first agreed unit_price, captured on the first staff price edit. NULL means the line has never been edited.';
