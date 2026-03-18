-- 192_customer_search_performance.sql
-- Performance indexes for customers/list endpoint at scale (1M+ users)
-- Enables trigram-based ILIKE search and optimizes the main query path

-- ============================================================
-- 1. ENABLE pg_trgm EXTENSION (for trigram-based ILIKE search)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 2. TRIGRAM GIN INDEXES for fast ILIKE search on name/email/phone
--    These allow PostgreSQL to use index scans for %pattern% searches
-- ============================================================

-- Name search (first_name || ' ' || last_name)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_trgm
  ON users USING gin ((lower(first_name || ' ' || last_name)) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Email search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm
  ON users USING gin (lower(email) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Phone search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone_trgm
  ON users USING gin (lower(phone) gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 3. COMPOSITE INDEX for the main customers/list query 
--    Covers: WHERE role_id IN (...) AND deleted_at IS NULL ORDER BY id DESC
-- ============================================================

-- Role-based listing with keyset pagination (id DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_id_desc
  ON users (role_id, id DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 4. COVERING INDEX for bookings pending_count LATERAL subquery
--    SELECT COUNT(*) FROM bookings WHERE student_user_id=? AND payment_status='pending'
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student_pending
  ON bookings (student_user_id)
  WHERE payment_status = 'pending' AND deleted_at IS NULL;

-- ============================================================
-- 5. INDEX for wallet_balances lookup in the customers JOIN
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_balances_user_currency
  ON wallet_balances (user_id, currency);
