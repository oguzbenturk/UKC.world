-- 257_add_original_price_to_customer_packages.sql
--
-- Add `original_price` column to customer_packages so that admin-driven
-- price edits (PATCH /customer-packages/:id/price) can preserve the very
-- first agreed price for display (strikethrough) while purchase_price
-- stores the current effective price.
--
-- NULL = price has never been edited; UI should not render a strikethrough.
-- On the first edit we copy the existing purchase_price into original_price
-- and overwrite purchase_price with the new value. Subsequent edits leave
-- original_price untouched.

BEGIN;

ALTER TABLE customer_packages
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);

COMMIT;
