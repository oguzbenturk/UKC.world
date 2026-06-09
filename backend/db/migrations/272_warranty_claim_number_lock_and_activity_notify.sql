-- 272_warranty_claim_number_lock_and_activity_notify.sql
--
-- Two warranty enhancements:
--
--   1) Manufacturer claim-number ownership lock.
--      The external (manufacturer) claim number can be set by a staff member
--      from their portal or by an admin. Until now ANY staff link could
--      silently overwrite it. We now record WHO set it so warrantyService can
--      lock the field to that person (admins may override). The denormalized
--      *_set_by_name keeps the display name stable even if the user or staff
--      link is later deleted/revoked.
--
--   2) Per-claim activity-digest watermark.
--      last_activity_notified_at marks the timestamp through which assigned
--      staff + admins have already been emailed about claim activity. The
--      notification digest selects events created after this watermark, sends
--      one bundled email per recipient, then advances it. Because the watermark
--      lives in the row (not just an in-memory timer), a dropped/lost debounce
--      timer self-heals: the next activity flush still includes the missed
--      events.

BEGIN;

ALTER TABLE warranty_claims
  ADD COLUMN IF NOT EXISTS external_claim_number_set_by_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_claim_number_set_by_staff_link_id  UUID REFERENCES warranty_staff_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_claim_number_set_by_name           TEXT,
  ADD COLUMN IF NOT EXISTS external_claim_number_set_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_notified_at                   TIMESTAMPTZ;

-- New event type for a dedicated, cleanly-rendered "claim number recorded"
-- timeline entry (previously piggy-backed on the generic 'note' type).
ALTER TABLE warranty_claim_events
  DROP CONSTRAINT IF EXISTS warranty_claim_events_event_type_check;

ALTER TABLE warranty_claim_events
  ADD CONSTRAINT warranty_claim_events_event_type_check
  CHECK (event_type IN (
    'submitted','status_change','note','customer_update',
    'media_added','media_removed','staff_assigned',
    'staff_revoked','link_resent','claim_closed','claim_deleted',
    'claim_number_set'
  ));

-- Recipient lookups for the digest enumerate active staff links by claim, and
-- occasionally resolve "which claims is this user assigned to". Index the FK.
CREATE INDEX IF NOT EXISTS idx_warranty_staff_links_user
  ON warranty_staff_links(staff_user_id)
  WHERE revoked_at IS NULL;

COMMIT;
