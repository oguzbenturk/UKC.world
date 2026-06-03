-- 267: Track exact package vs cash hour split on the bookings row itself.
--
-- Root cause of the partial-booking reversal/edit bugs: calendar-created
-- partial bookings (payment_status='partial') store NO booking_participants
-- row, so the exact hours drawn from the package (consumeFromPackage) were
-- never persisted anywhere. Every delete/cancel/duration-edit path then had to
-- GUESS `duration`, over- or under-restoring package hours.
--
-- We add package_hours_used / cash_hours_used directly on bookings so single-
-- participant partial (and package) bookings have an authoritative record of
-- the split, independent of whether a booking_participants row exists.
--
-- NULL = "not recorded" (legacy rows we cannot reconstruct) — code treats NULL
-- as unknown and falls back to the previous duration-based behaviour, so this
-- migration changes nothing for un-backfilled historical rows. New writes set
-- the columns explicitly.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS package_hours_used NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cash_hours_used    NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN bookings.package_hours_used IS
  'Exact package hours drawn for this booking (partial/package). NULL = not recorded (legacy); falls back to duration.';
COMMENT ON COLUMN bookings.cash_hours_used IS
  'Hours of this booking settled in cash/wallet rather than the package. NULL = not recorded (legacy).';

-- Backfill from booking_participants where a row exists (group/multi-user and
-- some single-user bookings). Sum across participants for the booking total.
WITH ph AS (
  SELECT bp.booking_id,
         SUM(COALESCE(bp.package_hours_used, 0)) AS pkg_hours,
         SUM(COALESCE(bp.cash_hours_used, 0))    AS cash_hours
    FROM booking_participants bp
   GROUP BY bp.booking_id
)
UPDATE bookings b
   SET package_hours_used = ph.pkg_hours,
       cash_hours_used    = NULLIF(ph.cash_hours, 0)
  FROM ph
 WHERE b.id = ph.booking_id
   AND b.package_hours_used IS NULL
   AND b.payment_status IN ('partial', 'package');

-- For pure-package single bookings with no participant row, the whole duration
-- came from the package — that is reconstructable and safe to set.
UPDATE bookings b
   SET package_hours_used = b.duration,
       cash_hours_used    = 0
 WHERE b.package_hours_used IS NULL
   AND b.payment_status = 'package'
   AND b.customer_package_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM booking_participants bp WHERE bp.booking_id = b.id);

-- NOTE: calendar-created single 'partial' bookings with no participant row are
-- intentionally LEFT NULL — their original package/cash split is unrecoverable,
-- so the code keeps its legacy fallback for them rather than guessing wrong.
