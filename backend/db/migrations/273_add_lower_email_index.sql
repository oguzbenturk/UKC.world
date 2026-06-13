-- 273_add_lower_email_index.sql
--
-- User email lookups are now case-insensitive everywhere (login, register dup-check,
-- admin user-create dup-check, password reset, email verification, booking/guest
-- linking) — they all match `WHERE LOWER(email) = LOWER($1)`. That predicate is not
-- SARGable against the plain `email` btree, so without a functional index every login
-- (a pre-auth, IP-rate-limited endpoint) sequentially scans the users table.
--
-- This partial functional index matches the lookups' `deleted_at IS NULL` filter.
-- CONCURRENTLY so building it does not lock the users table during deploy (the migration
-- runner detects CONCURRENTLY and runs this file non-transactionally).
--
-- NOTE: intentionally NOT UNIQUE. App-level dup-checks already prevent case-variant
-- duplicates, and the login query orders exact-case-first + LIMIT 1, so a UNIQUE index
-- is not required for correctness and would risk failing the migration if any legacy
-- case-collision exists in production. It can be promoted to UNIQUE later once prod is
-- confirmed collision-free.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_lower_email
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;
