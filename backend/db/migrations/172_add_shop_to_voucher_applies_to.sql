-- Migration: 172_add_shop_to_voucher_applies_to
-- Add 'shop' as a valid applies_to scope for voucher codes

-- Drop existing constraint and recreate with 'shop' included
ALTER TABLE voucher_codes DROP CONSTRAINT IF EXISTS voucher_codes_applies_to_check;
ALTER TABLE voucher_codes ADD CONSTRAINT voucher_codes_applies_to_check 
  CHECK (applies_to IN ('all', 'lessons', 'rentals', 'accommodation', 'packages', 'wallet', 'shop', 'specific'));
