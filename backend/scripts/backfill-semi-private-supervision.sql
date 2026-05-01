-- One-shot backfill: re-tag existing supervision services/packages with
-- max_participants > 1 to 'semi-private-supervision'.
--
-- Run only after reviewing the rows that will change. Safe to re-run.
--
-- ─── REVIEW STEP ────────────────────────────────────────────────────────
-- Run this first to see what would change:
--
-- SELECT id, name, max_participants, lesson_category_tag
-- FROM services
-- WHERE lesson_category_tag = 'supervision'
--   AND COALESCE(max_participants, 1) > 1;
--
-- SELECT id, name, max_participants, lesson_category_tag
-- FROM service_packages
-- WHERE lesson_category_tag = 'supervision'
--   AND COALESCE(max_participants, 1) > 1;
--
-- ─── APPLY STEP ─────────────────────────────────────────────────────────
-- Once you're happy with the rows above, run the UPDATEs below.

BEGIN;

UPDATE services
SET lesson_category_tag = 'semi-private-supervision'
WHERE lesson_category_tag = 'supervision'
  AND COALESCE(max_participants, 1) > 1;

UPDATE service_packages
SET lesson_category_tag = 'semi-private-supervision'
WHERE lesson_category_tag = 'supervision'
  AND COALESCE(max_participants, 1) > 1;

-- Inspect counts before committing:
--   SELECT lesson_category_tag, COUNT(*) FROM services
--   WHERE lesson_category_tag IN ('supervision','semi-private-supervision')
--   GROUP BY lesson_category_tag;

COMMIT;
