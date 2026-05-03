-- audit-pending-commissions.sql
--
-- Read-only sanity check for stale snapshots in manager_commissions and
-- instructor_earnings. Compares stored values to the entity's current price
-- minus active discounts so you can see how many rows the backfill will
-- touch BEFORE running it.
--
-- Run:
--   docker exec -i plannivo-dev-db psql -U plannivo -d plannivo_dev \
--     -f backend/scripts/audit-pending-commissions.sql
--
-- Or copy-paste sections into a psql session to scope further.

\pset pager off

-- ──────────────────────────────────────────────────────────────────────
-- 1. Pending manager commissions, with the post-discount entity total
-- ──────────────────────────────────────────────────────────────────────
SELECT
  mc.id AS commission_id,
  mc.source_type,
  mc.source_id,
  mc.source_amount         AS stored_source,
  mc.commission_amount     AS stored_commission,
  mc.commission_rate,
  CASE mc.source_type
    WHEN 'booking' THEN (
      SELECT COALESCE(b.final_amount, b.amount)
        FROM bookings b WHERE b.id = mc.source_id::uuid
    )
    WHEN 'rental' THEN (
      SELECT r.total_price FROM rentals r WHERE r.id = mc.source_id::uuid
    )
  END AS entity_base_price,
  COALESCE((
    SELECT SUM(d.amount) FROM discounts d
     WHERE d.entity_type = mc.source_type
       AND d.entity_id = mc.source_id
  ), 0) AS active_discount,
  COALESCE((
    SELECT SUM(d.amount) FROM discounts d
     WHERE d.entity_type = 'customer_package'
       AND d.entity_id = (
         SELECT b.customer_package_id::text
           FROM bookings b WHERE b.id = mc.source_id::uuid
       )
  ), 0) AS package_discount_for_booking,
  mc.source_date
FROM manager_commissions mc
WHERE mc.status != 'cancelled'
  AND mc.payout_id IS NULL
ORDER BY mc.source_date DESC, mc.id
LIMIT 200;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Pending instructor earnings — same idea, different table
-- ──────────────────────────────────────────────────────────────────────
SELECT
  ie.id AS earnings_id,
  ie.booking_id,
  ie.lesson_amount   AS stored_lesson_amount,
  ie.total_earnings  AS stored_total_earnings,
  ie.commission_rate,
  b.amount           AS booking_amount,
  b.final_amount     AS booking_final_amount,
  b.payment_status,
  b.customer_package_id,
  COALESCE((
    SELECT SUM(d.amount) FROM discounts d
     WHERE d.entity_type = 'booking'
       AND d.entity_id = b.id::text
  ), 0) AS booking_discount,
  COALESCE((
    SELECT SUM(d.amount) FROM discounts d
     WHERE d.entity_type = 'customer_package'
       AND d.entity_id = b.customer_package_id::text
  ), 0) AS package_discount,
  b.date
FROM instructor_earnings ie
JOIN bookings b ON b.id = ie.booking_id
WHERE ie.payroll_id IS NULL
  AND b.deleted_at IS NULL
ORDER BY b.date DESC, ie.id
LIMIT 200;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Quick count of pending rows per category (pre-backfill scope check)
-- ──────────────────────────────────────────────────────────────────────
SELECT
  'manager_commissions pending' AS bucket,
  COUNT(*) AS row_count
FROM manager_commissions
WHERE status != 'cancelled' AND payout_id IS NULL
UNION ALL
SELECT
  'manager_commissions on packages with active discount',
  COUNT(*)
FROM manager_commissions mc
JOIN bookings b ON b.id::text = mc.source_id AND mc.source_type = 'booking'
JOIN discounts d ON d.entity_type = 'customer_package'
                AND d.entity_id = b.customer_package_id::text
WHERE mc.status != 'cancelled' AND mc.payout_id IS NULL
UNION ALL
SELECT
  'instructor_earnings pending',
  COUNT(*)
FROM instructor_earnings ie
JOIN bookings b ON b.id = ie.booking_id
WHERE ie.payroll_id IS NULL AND b.deleted_at IS NULL;
