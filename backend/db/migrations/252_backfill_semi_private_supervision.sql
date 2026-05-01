-- Migration 252: Intentionally a no-op.
-- A backfill of existing supervision services/packages with capacity > 1
-- to the new 'semi-private-supervision' tag is provided as a manual one-shot
-- script at backend/scripts/backfill-semi-private-supervision.sql, so the
-- production data can be reviewed before re-tagging.

SELECT 1;
