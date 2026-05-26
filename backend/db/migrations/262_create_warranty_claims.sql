-- 262_create_warranty_claims.sql
--
-- UKC.Care warranty claim management. Customers submit claims via a public
-- form (no auth) and track them via an 8-character readable code at
-- /care/track/:code. The warranty team gets a separate 8-char code at
-- /care/staff/:code (also no auth). Admins manage the full lifecycle from
-- /admin/warranty inside the dashboard.
--
-- Schema choices:
--   * Status is a TEXT column with CHECK constraint, not a pg ENUM — matches
--     this codebase's convention (no other table uses ENUM types).
--   * customer_token / staff_token use the readable alphabet
--     ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0/O/1/I/L). 8 chars → ~3.5×10^11
--     combinations, collision-checked at insert time by warrantyService.
--   * Counters (total_bytes, photo_count, video_count) are denormalized on
--     warranty_claims so the 1.5 GB / 10-photo / 3-video caps can be enforced
--     in a single SELECT without scanning warranty_claim_media.
--   * Soft delete on warranty_claims (deleted_at) — admin can delete a claim
--     and we want to keep the audit trail. Media files are HARD deleted by
--     the application layer when the claim is soft-deleted (frees disk).
--   * warranty_claim_events is the authoritative timeline; the existing
--     audit_logs table receives a parallel row only for admin destructive
--     actions (delete, close, status change, staff invite).

BEGIN;

CREATE TABLE IF NOT EXISTS warranty_claims (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_token        CHAR(8) NOT NULL UNIQUE,
  status                TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN (
                          'submitted','under_review','approved','with_manufacturer',
                          'awaiting_customer','resolved','rejected','closed'
                        )),
  customer_name         TEXT NOT NULL,
  customer_email        TEXT NOT NULL,
  customer_phone        TEXT,
  product_name          TEXT NOT NULL,
  product_brand         TEXT,
  product_model         TEXT,
  product_serial        TEXT,
  purchase_date         DATE,
  purchase_location     TEXT,
  issue_description     TEXT NOT NULL,
  preferred_language    CHAR(2) NOT NULL DEFAULT 'tr'
                        CHECK (preferred_language IN ('tr','en')),
  total_bytes           BIGINT NOT NULL DEFAULT 0,
  photo_count           INTEGER NOT NULL DEFAULT 0,
  video_count           INTEGER NOT NULL DEFAULT 0,
  external_claim_number TEXT,
  submitted_ip          INET,
  submitted_user_agent  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_status_open
  ON warranty_claims(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_created_at
  ON warranty_claims(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_customer_email
  ON warranty_claims(LOWER(customer_email))
  WHERE deleted_at IS NULL;

-- Reuse a generic updated_at trigger so we do not depend on a project-wide
-- helper that may or may not exist. Defined idempotently.
CREATE OR REPLACE FUNCTION warranty_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS warranty_claims_set_updated_at ON warranty_claims;
CREATE TRIGGER warranty_claims_set_updated_at
  BEFORE UPDATE ON warranty_claims
  FOR EACH ROW
  EXECUTE FUNCTION warranty_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warranty_staff_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id              UUID NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  staff_token           CHAR(8) NOT NULL UNIQUE,
  staff_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  staff_name            TEXT NOT NULL,
  staff_email           TEXT NOT NULL,
  claim_number_external TEXT,
  revoked_at            TIMESTAMPTZ,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_staff_links_active
  ON warranty_staff_links(claim_id)
  WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warranty_claim_media (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                  UUID NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  kind                      TEXT NOT NULL CHECK (kind IN ('photo','video')),
  filename                  TEXT NOT NULL,
  original_name             TEXT NOT NULL,
  size_bytes                BIGINT NOT NULL CHECK (size_bytes > 0),
  mime_type                 TEXT NOT NULL,
  storage_path              TEXT NOT NULL,
  uploaded_by_kind          TEXT NOT NULL DEFAULT 'customer'
                            CHECK (uploaded_by_kind IN ('customer','staff','admin')),
  uploaded_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_staff_link_id UUID REFERENCES warranty_staff_links(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claim_media_claim
  ON warranty_claim_media(claim_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warranty_claim_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            UUID NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL CHECK (event_type IN (
                        'submitted','status_change','note','customer_update',
                        'media_added','media_removed','staff_assigned',
                        'staff_revoked','link_resent','claim_closed','claim_deleted'
                      )),
  actor_kind          TEXT NOT NULL CHECK (actor_kind IN ('admin','staff','customer','system')),
  actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_staff_link_id UUID REFERENCES warranty_staff_links(id) ON DELETE SET NULL,
  visible_to_customer BOOLEAN NOT NULL DEFAULT TRUE,
  body                TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claim_events_claim
  ON warranty_claim_events(claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warranty_claim_events_visible
  ON warranty_claim_events(claim_id, visible_to_customer, created_at DESC);

COMMIT;
