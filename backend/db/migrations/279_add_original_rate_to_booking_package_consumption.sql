-- 279: Audit column for the package-UPGRADE re-pricing of completed lessons.
--
-- booking_package_consumption.rate_per_hour is FROZEN at consumption time (mig
-- 278) so a later package-price EDIT never retro-changes a past booking's
-- revenue/commission. The package UPGRADE flow is the ONE sanctioned exception:
-- when a customer's package is upgraded to a bigger/better tier, every active
-- (non-released) consumption row is re-priced to the new tier's effective
-- per-hour rate so all already-completed lessons adopt the new package price.
--
-- We preserve the very first frozen rate in original_rate_per_hour (set once, on
-- the first re-price) so the change is auditable and so a later reversal can
-- still reason about what was originally charged. NULL = never re-priced.
ALTER TABLE booking_package_consumption
  ADD COLUMN IF NOT EXISTS original_rate_per_hour NUMERIC(12,4) NULL;

COMMENT ON COLUMN booking_package_consumption.original_rate_per_hour IS
  'The rate_per_hour as first frozen at consumption time, preserved on the first package-upgrade re-price (NULL = rate never re-priced by an upgrade).';
