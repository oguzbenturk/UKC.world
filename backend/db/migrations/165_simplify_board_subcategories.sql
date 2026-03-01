-- Migration 165: Simplify board subcategories
-- Remove Surfboard SLS as separate filter (merge into Surfboards parent)
-- Rename Twintip SLS label to just "SLS"

-- Merge surfboard-sls products into surfboards parent
UPDATE products SET subcategory = 'boards-surfboards' WHERE category = 'kitesurf' AND subcategory = 'boards-surfboards-sls';

-- Remove surfboard-sls from subcategories table
DELETE FROM product_subcategories WHERE category = 'kitesurf' AND subcategory = 'boards-surfboards-sls';

-- Update display names
UPDATE product_subcategories SET display_name = 'SLS' WHERE category = 'kitesurf' AND subcategory = 'boards-twintips-sls';
UPDATE product_subcategories SET display_name = 'DLAB' WHERE category = 'kitesurf' AND subcategory = 'boards-surfboards-dlab';
