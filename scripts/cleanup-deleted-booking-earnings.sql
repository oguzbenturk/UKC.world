-- Cleanup: remove payroll leftovers attached to soft-deleted bookings.
-- Mirrors what the current DELETE /bookings/:id flow does (since v0.1.294):
--   * drop instructor_earnings not yet settled in payroll (payroll_id IS NULL)
--   * cancel still-pending manager_commissions
-- Older deletions (pre-v0.1.294) left these behind, inflating pending payroll
-- balances and instructor-cost aggregates. Idempotent: re-running affects 0 rows.

DO $$
DECLARE
  v_earn_rows int;
  v_earn_sum numeric;
  v_mc_rows int;
  v_mc_sum numeric;
BEGIN
  SELECT count(*), COALESCE(SUM(ie.total_earnings),0) INTO v_earn_rows, v_earn_sum
    FROM instructor_earnings ie JOIN bookings b ON b.id = ie.booking_id
   WHERE b.deleted_at IS NOT NULL AND ie.payroll_id IS NULL;

  DELETE FROM instructor_earnings ie
   USING bookings b
   WHERE b.id = ie.booking_id AND b.deleted_at IS NOT NULL AND ie.payroll_id IS NULL;
  RAISE NOTICE 'instructor_earnings deleted: % rows, EUR %', v_earn_rows, v_earn_sum;

  SELECT count(*), COALESCE(SUM(mc.commission_amount),0) INTO v_mc_rows, v_mc_sum
    FROM manager_commissions mc JOIN bookings b ON b.id::text = mc.source_id
   WHERE mc.source_type = 'booking' AND b.deleted_at IS NOT NULL AND mc.status = 'pending';

  UPDATE manager_commissions mc SET status = 'cancelled', updated_at = NOW()
    FROM bookings b
   WHERE b.id::text = mc.source_id AND mc.source_type = 'booking'
     AND b.deleted_at IS NOT NULL AND mc.status = 'pending';
  RAISE NOTICE 'manager_commissions cancelled: % rows, EUR %', v_mc_rows, v_mc_sum;
END $$;
