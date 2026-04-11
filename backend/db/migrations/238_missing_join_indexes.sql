-- Migration 238: Add composite indexes for bookings GET / query
-- The main bookings list query has 15 JOINs. These three composite indexes
-- replace single-column lookups that force extra filter scans.

-- Used in: LEFT JOIN instructor_category_rates icr
--   ON icr.instructor_id = b.instructor_user_id AND icr.lesson_category = srv.lesson_category_tag
CREATE INDEX IF NOT EXISTS idx_instructor_category_rates_lookup
  ON instructor_category_rates(instructor_id, lesson_category);

-- Used in: EXISTS (SELECT 1 FROM booking_participants bp2
--   WHERE bp2.booking_id = b.id AND bp2.user_id = $3)
CREATE INDEX IF NOT EXISTS idx_booking_participants_booking_user
  ON booking_participants(booking_id, user_id);

-- Used in: LEFT JOIN wallet_transactions t
--   ON t.booking_id = b.id AND t.transaction_type IN ('charge', 'booking_charge')
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking_type
  ON wallet_transactions(booking_id, transaction_type);
