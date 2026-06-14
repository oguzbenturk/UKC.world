-- 274_warranty_documents.sql
--
-- "Product Bill" (PDF) document support for warranty claims.
--
-- Manufacturers periodically ask UKC to provide the purchase bill / proof of
-- purchase for a warranty case. Until now warranty_claim_media only accepted
-- 'photo' and 'video', so there was nowhere to upload a PDF. This adds a third
-- media kind, 'document' (PDF), and a denormalized document_count on
-- warranty_claims that mirrors the existing photo_count / video_count counters
-- (kept in sync by warrantyService.attach/detachMediaRecord so per-kind upload
-- caps can be enforced in a single SELECT).
--
-- Documents are treated as INTERNAL (team-only): they are uploadable by staff
-- and admins, never by the anonymous public form, and are intentionally NOT
-- surfaced on the customer tracking page (a manufacturer bill can be UKC's
-- wholesale invoice). That visibility rule lives in the application layer
-- (publicWarranty.js); only the storage + counter schema changes here.

BEGIN;

ALTER TABLE warranty_claims
  ADD COLUMN IF NOT EXISTS document_count INTEGER NOT NULL DEFAULT 0;

-- The inline CHECK from 262 is auto-named warranty_claim_media_kind_check.
ALTER TABLE warranty_claim_media
  DROP CONSTRAINT IF EXISTS warranty_claim_media_kind_check;

ALTER TABLE warranty_claim_media
  ADD CONSTRAINT warranty_claim_media_kind_check
  CHECK (kind IN ('photo','video','document'));

COMMIT;
