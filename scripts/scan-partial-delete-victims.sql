-- Read-only scan for victims of the pre-v0.1.294 booking-deletion gaps.
-- A) Soft-deleted bookings whose wallet charges were never (fully) refunded
\echo '=== A) Deleted bookings with outstanding net wallet charges ==='
SELECT b.id, b.date, COALESCE(u.name,'?') AS student, b.duration AS hrs,
       b.payment_status AS pay_st, b.final_amount AS face,
       b.deleted_at::date AS deleted, w.currency, ROUND(-w.net,2) AS outstanding
FROM bookings b
LEFT JOIN users u ON u.id = b.student_user_id
JOIN LATERAL (
  SELECT wt.currency, COALESCE(SUM(wt.available_delta),0) AS net
    FROM wallet_transactions wt
   WHERE wt.status = 'completed'
     AND (wt.booking_id = b.id
          OR (wt.related_entity_type = 'booking' AND wt.related_entity_id = b.id))
   GROUP BY wt.currency
  HAVING COALESCE(SUM(wt.available_delta),0) < -0.005
) w ON true
WHERE b.deleted_at IS NOT NULL
ORDER BY b.deleted_at, b.date;

-- B) Package hour drift: recorded used_hours vs hours drawn by LIVE bookings
\echo '=== B) Packages whose used_hours != live booking draws (drift > 0 = phantom consumption) ==='
WITH part_pkg AS (
  SELECT bp.booking_id, bp.customer_package_id, bp.payment_status, bp.package_hours_used
    FROM booking_participants bp
   WHERE bp.customer_package_id IS NOT NULL
     AND bp.payment_status IN ('package','partial')
),
draws AS (
  SELECT pp.customer_package_id AS pkg_id,
         SUM(COALESCE(pp.package_hours_used,
             CASE WHEN pp.payment_status = 'package' THEN b.duration ELSE 0 END)) AS hours
    FROM part_pkg pp
    JOIN bookings b ON b.id = pp.booking_id
   WHERE b.deleted_at IS NULL AND b.status <> 'cancelled'
   GROUP BY 1
  UNION ALL
  SELECT b.customer_package_id,
         SUM(COALESCE(b.package_hours_used,
             CASE WHEN b.payment_status = 'package' THEN b.duration ELSE 0 END))
    FROM bookings b
   WHERE b.customer_package_id IS NOT NULL
     AND b.payment_status IN ('package','partial')
     AND b.deleted_at IS NULL AND b.status <> 'cancelled'
     AND NOT EXISTS (SELECT 1 FROM part_pkg pp WHERE pp.booking_id = b.id)
   GROUP BY 1
),
agg AS (SELECT pkg_id, SUM(hours) AS live_hours FROM draws GROUP BY 1)
SELECT cp.id, COALESCE(u.name,'?') AS customer, cp.package_name, cp.status,
       cp.total_hours AS total, cp.used_hours AS used,
       COALESCE(a.live_hours,0) AS live_draws,
       ROUND(cp.used_hours - COALESCE(a.live_hours,0), 2) AS drift
FROM customer_packages cp
LEFT JOIN agg a ON a.pkg_id = cp.id
LEFT JOIN users u ON u.id = cp.customer_id
WHERE COALESCE(cp.total_hours,0) > 0
  AND cp.status NOT IN ('cancelled','pending_payment','waiting_payment')
  AND ABS(COALESCE(cp.used_hours,0) - COALESCE(a.live_hours,0)) > 0.01
ORDER BY (cp.used_hours - COALESCE(a.live_hours,0)) DESC;

-- C) Instructor earnings still attached to soft-deleted bookings
\echo '=== C) Instructor earnings on deleted bookings (paid_out=t means already in payroll) ==='
SELECT b.deleted_at::date AS deleted, b.date AS lesson, COALESCE(u.name,'?') AS instructor,
       ie.total_earnings, ie.currency, (ie.payroll_id IS NOT NULL) AS paid_out, b.id AS booking_id
FROM instructor_earnings ie
JOIN bookings b ON b.id = ie.booking_id
LEFT JOIN users u ON u.id = ie.instructor_id
WHERE b.deleted_at IS NOT NULL
ORDER BY b.deleted_at;

-- D) Pending manager commissions on soft-deleted bookings
\echo '=== D) Pending manager commissions on deleted bookings ==='
SELECT b.deleted_at::date AS deleted, b.date AS lesson, COALESCE(u.name,'?') AS manager,
       mc.commission_amount, mc.status, b.id AS booking_id
FROM manager_commissions mc
JOIN bookings b ON b.id::text = mc.source_id
LEFT JOIN users u ON u.id = mc.manager_user_id
WHERE mc.source_type = 'booking' AND b.deleted_at IS NOT NULL AND mc.status = 'pending'
ORDER BY b.deleted_at;
