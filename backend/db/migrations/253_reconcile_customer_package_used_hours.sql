-- 253_reconcile_customer_package_used_hours.sql
--
-- One-shot reconciliation: rebuild customer_packages.used_hours and
-- customer_packages.remaining_hours from the live (non-deleted, non-cancelled)
-- booking sum. Necessary because the PUT /bookings/:id endpoint historically
-- updated booking.duration without adjusting the linked package's used_hours,
-- so packages drifted out of sync whenever a booking's hours were edited
-- after creation.
--
-- This migration is idempotent — re-running it produces no further change
-- once packages match the booking ledger.

BEGIN;

-- 1) Compute the live used hours per package, accounting for both the legacy
--    "single owner" model (bookings.customer_package_id) and the multi-user
--    model (booking_participants.customer_package_id + package_hours_used).
WITH live_usage AS (
  -- Direct booking link
  SELECT
    b.customer_package_id AS package_id,
    SUM(COALESCE(b.duration, 0))::numeric(10, 2) AS hours
  FROM bookings b
  WHERE b.customer_package_id IS NOT NULL
    AND b.deleted_at IS NULL
    AND b.status NOT IN ('cancelled', 'no-show', 'no_show', 'pending_payment')
    AND NOT EXISTS (
      -- If the booking has participants, prefer the participant-level link.
      SELECT 1 FROM booking_participants bp
      WHERE bp.booking_id = b.id AND bp.customer_package_id IS NOT NULL
    )
  GROUP BY b.customer_package_id

  UNION ALL

  -- Participant link (group / semi-private bookings paid by package)
  SELECT
    bp.customer_package_id AS package_id,
    SUM(COALESCE(bp.package_hours_used, b.duration, 0))::numeric(10, 2) AS hours
  FROM booking_participants bp
  JOIN bookings b ON b.id = bp.booking_id
  WHERE bp.customer_package_id IS NOT NULL
    AND bp.payment_status = 'package'
    AND b.deleted_at IS NULL
    AND b.status NOT IN ('cancelled', 'no-show', 'no_show', 'pending_payment')
  GROUP BY bp.customer_package_id
),
totals AS (
  SELECT package_id, SUM(hours)::numeric(10, 2) AS used
  FROM live_usage
  GROUP BY package_id
)
UPDATE customer_packages cp
SET
  used_hours      = COALESCE(t.used, 0),
  remaining_hours = GREATEST(0, COALESCE(cp.total_hours, 0) - COALESCE(t.used, 0)),
  updated_at      = NOW()
FROM totals t
WHERE cp.id = t.package_id
  AND (
    COALESCE(cp.used_hours, 0) <> COALESCE(t.used, 0)
    OR COALESCE(cp.remaining_hours, 0) <> GREATEST(0, COALESCE(cp.total_hours, 0) - COALESCE(t.used, 0))
  );

-- 2) Packages with NO live bookings: zero out used_hours.
UPDATE customer_packages cp
SET
  used_hours      = 0,
  remaining_hours = COALESCE(cp.total_hours, 0),
  updated_at      = NOW()
WHERE cp.id NOT IN (
    SELECT live_pkgs.package_id FROM (
      SELECT b.customer_package_id AS package_id
      FROM bookings b
      WHERE b.customer_package_id IS NOT NULL
        AND b.deleted_at IS NULL
        AND b.status NOT IN ('cancelled', 'no-show', 'no_show', 'pending_payment')
      UNION
      SELECT bp.customer_package_id AS package_id
      FROM booking_participants bp
      JOIN bookings b2 ON b2.id = bp.booking_id
      WHERE bp.customer_package_id IS NOT NULL
        AND bp.payment_status = 'package'
        AND b2.deleted_at IS NULL
        AND b2.status NOT IN ('cancelled', 'no-show', 'no_show', 'pending_payment')
    ) live_pkgs
  )
  AND (COALESCE(cp.used_hours, 0) <> 0
    OR COALESCE(cp.remaining_hours, 0) <> COALESCE(cp.total_hours, 0));

COMMIT;
