-- 259_add_participant_user_id_to_discounts.sql
--
-- Per-participant discount support on group/semi-private/supervision bookings.
-- A 2h supervision booked for two students has a single bookings row with
-- group_size=2 and amount=group_total. Each student's actual share lives on
-- booking_participants.payment_amount. Without this column, the discounts
-- table could only hold one row per booking — meaning a discount applied
-- from one participant's profile would silently affect the other participant
-- too, and the bill couldn't show participant-specific discounts.
--
-- participant_user_id is NULL for the legacy "discount applies to whole
-- entity" semantics (still the case for solo bookings, rentals, packages,
-- accommodation, memberships, shop orders). For group bookings, staff can
-- now apply distinct discounts per participant.
--
-- Replaces the single UNIQUE (entity_type, entity_id) constraint with two
-- partial unique indexes: one for participant-less rows (enforces "one row
-- per entity"), one for participant-scoped rows (enforces "one row per
-- entity per participant").

BEGIN;

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS participant_user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_unique_entity;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discounts_unique_entity_solo
  ON discounts (entity_type, entity_id)
  WHERE participant_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discounts_unique_entity_per_participant
  ON discounts (entity_type, entity_id, participant_user_id)
  WHERE participant_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discounts_participant_user
  ON discounts (participant_user_id)
  WHERE participant_user_id IS NOT NULL;

COMMIT;
