-- 254_reconcile_customer_package_status.sql
--
-- Companion to 253: when used_hours/remaining_hours are corrected, the
-- `status` field can be left stale. A package with remaining_hours > 0
-- should be 'active', and a package with remaining_hours = 0 from an
-- 'active' state should be 'used_up'. Cancelled / refunded states are
-- preserved (they carry intent, not a derived count).

BEGIN;

UPDATE customer_packages
SET status = 'active', updated_at = NOW()
WHERE status IN ('used_up', 'completed', 'expired')
  AND COALESCE(remaining_hours, 0) > 0
  AND (COALESCE(expiry_date, NOW()::date + INTERVAL '1 day') > NOW()::date);

-- Inverse: an active package with zero remaining hours should reflect that.
UPDATE customer_packages
SET status = 'used_up', updated_at = NOW()
WHERE status = 'active'
  AND COALESCE(total_hours, 0) > 0
  AND COALESCE(remaining_hours, 0) <= 0
  AND COALESCE(used_hours, 0) >= COALESCE(total_hours, 0);

COMMIT;
