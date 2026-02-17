-- Database performance optimization for customer loading
-- This script creates indexes to make customer data loading BLAZING FAST

-- Enable trigram extension for fast ILIKE/LIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users search indexes (name/email/phone)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_fullname_trgm 
ON users USING gin (lower(first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm 
ON users USING gin (lower(email) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone_trgm 
ON users USING gin (lower(phone) gin_trgm_ops);

-- Users role and balance filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_balance ON users(balance);

-- Index for bookings by student_user_id (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student_user_id 
ON bookings(student_user_id);

-- Index for bookings by student_user_id and date (for ordering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student_date 
ON bookings(student_user_id, date DESC);

-- Index for bookings by student_user_id, status, and payment_status (for unpaid lesson queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student_status_payment 
ON bookings(student_user_id, status, payment_status);

-- Index for student_accounts by user_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_accounts_user_id 
ON student_accounts(user_id);

-- Index for users by role (to quickly find students)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role 
ON users(role);

-- Index for services by id (for joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_id 
ON services(id);

-- Composite index for bookings performance (covers most queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_composite 
ON bookings(student_user_id, date DESC, status, payment_status);

-- Update table statistics for better query planning
ANALYZE bookings;
ANALYZE student_accounts;
ANALYZE users;
ANALYZE services;

-- Display index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('bookings', 'student_accounts', 'users', 'services')
ORDER BY tablename, indexname;
