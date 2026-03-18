-- Migration 194: Change manager_commissions.source_id from UUID to TEXT
-- Reason: shop_orders use INTEGER primary keys, not UUIDs.
-- All other source types (bookings, rentals, accommodations, member_purchases,
-- customer_packages) use UUIDs which are valid TEXT values, so existing data
-- is unaffected.

ALTER TABLE manager_commissions
  ALTER COLUMN source_id TYPE TEXT USING source_id::TEXT;
