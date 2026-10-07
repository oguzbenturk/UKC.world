-- Migration 292: instructor payout requests (spec docs/specs/instructor-earnings-payouts.md §1)
--
-- An instructor asks for (part of) their available earnings to be paid out;
-- admin/manager pays it (which records a normal instructor_payment ledger row via
-- staffPaymentService.recordInstructorPayment — payment_id points at that
-- wallet_transactions row) or declines it with a reason.
--
-- Also extends notification_type_enum with the three payout notification types
-- (dispatchToStaff / dispatchNotification insert them into notifications.type).
-- ADD VALUE inside the migration transaction is fine as long as the new values
-- are not used in the same transaction (they are not).

CREATE TABLE IF NOT EXISTS instructor_payout_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id    UUID NOT NULL REFERENCES users(id),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency         VARCHAR(3) NOT NULL DEFAULT 'EUR',
  preferred_method VARCHAR(32),
  note             TEXT,
  status           VARCHAR(16) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'rejected', 'cancelled')),
  admin_note       TEXT,
  decided_by       UUID REFERENCES users(id),
  decided_at       TIMESTAMPTZ,
  payment_id       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open request per instructor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_instructor_payout_requests_one_pending
  ON instructor_payout_requests (instructor_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_instructor_payout_requests_status_created
  ON instructor_payout_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_instructor_payout_requests_instructor
  ON instructor_payout_requests (instructor_id, created_at DESC);

ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'payout_request_created';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'payout_request_paid';
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'payout_request_rejected';
