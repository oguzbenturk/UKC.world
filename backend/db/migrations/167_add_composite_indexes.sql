-- 167_performance_indexes.sql
-- Composite and covering indexes to speed up the most common queries
-- All use IF NOT EXISTS so re-running is safe

-- ============================================================
-- PRODUCTS  (shop browsing, by-category, filtering)
-- ============================================================

-- Shop by-category endpoint: WHERE status='active' AND stock_quantity>0 ORDER BY is_featured, created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active_shop
  ON products (status, is_featured DESC, created_at DESC)
  WHERE status = 'active' AND stock_quantity > 0;

-- Main product listing: WHERE status=? AND category=? ORDER BY created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_status_category_created
  ON products (status, category, created_at DESC);

-- Featured product filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_featured
  ON products (is_featured)
  WHERE is_featured = true;

-- ============================================================
-- BOOKINGS  (calendar, available-slots, listing, finance)
-- ============================================================

-- Available-slots batch query: WHERE date IN (...) AND deleted_at IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_date_active
  ON bookings (date)
  WHERE deleted_at IS NULL;

-- Calendar + slot queries filtered by instructor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_date_instructor
  ON bookings (date, instructor_user_id)
  WHERE deleted_at IS NULL;

-- Student lookup (booking list, participant queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student
  ON bookings (student_user_id)
  WHERE deleted_at IS NULL;

-- Status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_status
  ON bookings (status)
  WHERE deleted_at IS NULL;

-- Payment status for finance queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_payment_status
  ON bookings (payment_status)
  WHERE deleted_at IS NULL;

-- Booking participants lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_participants_booking
  ON booking_participants (booking_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_participants_user
  ON booking_participants (user_id);

-- ============================================================
-- WALLET / TRANSACTIONS  (finance dashboards, wallet pages)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_user_created
  ON wallet_transactions (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_booking
  ON wallet_transactions (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_type
  ON wallet_transactions (transaction_type);

-- ============================================================
-- USERS  (role lookups, soft-delete, name search)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
  ON users (role_id)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users (email)
  WHERE deleted_at IS NULL;

-- ============================================================
-- COMMISSION TABLES  (instructor metrics, booking display)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_custom_commissions_booking
  ON booking_custom_commissions (booking_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_instructor_service_commissions_lookup
  ON instructor_service_commissions (instructor_id, service_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_instructor_default_commissions_instructor
  ON instructor_default_commissions (instructor_id);

-- ============================================================
-- CUSTOMER PACKAGES  (booking creation, package deduction)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_packages_user
  ON customer_packages (user_id)
  WHERE status = 'active';

-- ============================================================
-- EVENTS  (public listing, admin listing)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_date
  ON events (event_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_registrations_event
  ON event_registrations (event_id);

-- ============================================================
-- RENTALS  (finance metrics)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_created
  ON rentals (created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_status
  ON rentals (status);

-- ============================================================
-- PRODUCT SUBCATEGORIES  (shop sidebar, category filter)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_subcategories_category
  ON product_subcategories (category)
  WHERE is_active = true;
