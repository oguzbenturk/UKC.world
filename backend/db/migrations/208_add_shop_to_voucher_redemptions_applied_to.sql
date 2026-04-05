-- Migration 208: Allow 'shop' on voucher_redemptions.applied_to_type (shop checkout redemptions)

ALTER TABLE voucher_redemptions DROP CONSTRAINT IF EXISTS voucher_redemptions_applied_to_type_check;
ALTER TABLE voucher_redemptions ADD CONSTRAINT voucher_redemptions_applied_to_type_check
  CHECK (applied_to_type IN ('booking', 'package', 'rental', 'accommodation', 'wallet', 'shop'));
