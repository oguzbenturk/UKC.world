-- 278: Per-booking, per-package hour-consumption ledger — the source of truth
-- for CROSS-PACKAGE FIFO spillover (a single lesson can draw hours from more
-- than one of a customer's compatible packages, oldest first).
--
-- Why a ledger instead of overloading bookings.customer_package_id:
--   * customer_package_id is a single FK read by ~15 call sites; it stays
--     populated with the PRIMARY (first/oldest) package for backward-compat.
--   * The reversal logic (restore/reconsume on cancel/edit) used to GUESS hours
--     from package_hours_used / duration. With one row per (booking[, participant],
--     package) the exact draws become an explicit, queryable fact — directly
--     attacking the orphan-earnings / phantom-refund / double-undo bug class.
--
-- Backward-compat contract:
--   * No ledger rows for a booking  => legacy booking; every code path falls back
--     to bookings.customer_package_id + package_hours_used exactly as before.
--   * bookings.package_hours_used  = SUM of this booking's non-released hours_used.
--   * bookings.cash_hours_used     = cash overflow leg (pool exhausted).
--
-- released_at: cancel / duration-down edits give hours BACK to the package and
-- set released_at WITHOUT deleting the row, so restore-from-soft-delete can
-- re-consume the exact same chain (deterministic, kills the double-undo mode).

CREATE TABLE IF NOT EXISTS booking_package_consumption (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic draw order. created_at is transaction-time (identical for every
  -- row written in one booking), so LIFO release on a duration-down edit needs
  -- this to release the most-recently-drawn package first.
  seq                 BIGINT GENERATED ALWAYS AS IDENTITY,
  booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  participant_id      UUID NULL REFERENCES booking_participants(id) ON DELETE CASCADE,
  customer_package_id UUID NOT NULL REFERENCES customer_packages(id),
  hours_used          NUMERIC(10,2) NOT NULL CHECK (hours_used > 0),
  -- Effective lesson-only per-hour rate FROZEN at consumption time (owner
  -- decision: freeze, so a later package-price edit never retro-changes a past
  -- spillover booking's revenue/commission). Mirrors computeLessonAmount's
  -- discount-adjusted, rental/accom-deducted rate.
  rate_per_hour       NUMERIC(12,4) NULL,
  released_at         TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bpc_booking_idx     ON booking_package_consumption(booking_id);
CREATE INDEX IF NOT EXISTS bpc_participant_idx ON booking_package_consumption(participant_id);
CREATE INDEX IF NOT EXISTS bpc_package_idx     ON booking_package_consumption(customer_package_id);

COMMENT ON TABLE booking_package_consumption IS
  'FIFO cross-package hour draws backing a booking/participant. Absence of rows = legacy booking; fall back to bookings.customer_package_id + package_hours_used.';
