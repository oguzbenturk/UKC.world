-- 276_create_email_deliveries.sql
--
-- App-wide outbound email delivery log. Until now the only proof an email was
-- sent was a transient winston log line; there was no way to answer "did it
-- actually reach the recipient?" from inside the app. This table records every
-- transactional email at send time (status='sent') and is then updated by
-- Resend webhook events (delivered / bounced / complained / opened) so staff
-- can SEE per-recipient delivery status (e.g. on a warranty claim).
--
-- Correlation: we send via SMTP (smtp.resend.com), so Resend assigns its own
-- email_id that we don't know at send time. The webhook handler matches an
-- incoming event to a row by (recipient + subject, newest within a few days),
-- then stamps provider_id (Resend's email_id) so subsequent events for the
-- same email match directly on provider_id.
--
-- Schema choices mirror this codebase: TEXT + app-level values (no pg ENUM),
-- no FK on user_id (recipients are often non-users: customers, staff links).

BEGIN;

CREATE TABLE IF NOT EXISTS email_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         TEXT,                 -- Resend email_id (learned from the first webhook event)
  message_id          TEXT,                 -- our Message-ID header (from nodemailer)
  recipient           TEXT NOT NULL,
  subject             TEXT,
  notification_type   TEXT,                 -- e.g. 'warranty_staff_link_sent'
  user_id             UUID,                 -- recipient's user id when known (no FK — many recipients aren't users)
  related_entity_type TEXT,                 -- e.g. 'warranty_claim'
  related_entity_id   TEXT,                 -- e.g. the claim id (TEXT so it fits UUID and INT PKs alike)
  status              TEXT NOT NULL DEFAULT 'sent'
                      CHECK (status IN (
                        'sent','delivery_delayed','delivered','opened','clicked',
                        'bounced','complained','failed'
                      )),
  error               TEXT,                 -- failure / bounce reason
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at       TIMESTAMPTZ,          -- timestamp of the most recent webhook event
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct match for the 2nd+ webhook event of an email.
CREATE INDEX IF NOT EXISTS idx_email_deliveries_provider_id
  ON email_deliveries (provider_id) WHERE provider_id IS NOT NULL;

-- First-event fallback match: newest send to a recipient.
CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient
  ON email_deliveries (lower(recipient), created_at DESC);

-- Per-entity lookup for the UI (e.g. all emails for a warranty claim).
CREATE INDEX IF NOT EXISTS idx_email_deliveries_entity
  ON email_deliveries (related_entity_type, related_entity_id);

COMMIT;
