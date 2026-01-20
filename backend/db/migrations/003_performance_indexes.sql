-- Database Performance Optimization Migration
-- Sprint 1: Infrastructure & Database Optimization
-- Add indexes for high-frequency queries

-- Add indexes for booking queries (most frequently accessed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_date_status 
ON bookings(date, status) 
WHERE status != 'cancelled';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_instructor_date 
ON bookings(instructor_user_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_student_date 
ON bookings(student_user_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_created_at 
ON bookings(created_at);

-- Add indexes for service queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_category_level 
ON services(category, level);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_active 
ON services(active) 
WHERE active = true;

-- Add indexes for user queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_active 
ON users(email) 
WHERE active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_active 
ON users(role_id) 
WHERE active = true;

-- Add indexes for transaction queries (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_date 
        ON transactions(user_id, transaction_date);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_status_date 
        ON transactions(type, status, transaction_date);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_amount_date 
        ON transactions(amount, transaction_date);
    END IF;
END $$;

-- Add indexes for financial reports (if payment tables exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payments') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_booking_status 
        ON payments(booking_id, status);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_created_date_status 
        ON payments(created_at, status);
    END IF;
END $$;

-- Add composite index for booking calendar queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_calendar_composite 
ON bookings(date, start_hour, instructor_user_id, status)
WHERE status IN ('confirmed', 'pending');

-- Add index for equipment rentals (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'equipment_rentals') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_equipment_rentals_date_status 
        ON equipment_rentals(rental_date, status);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_equipment_rentals_equipment_date 
        ON equipment_rentals(equipment_id, rental_date);
    END IF;
END $$;

-- Add index for session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_id_active 
ON user_sessions(user_id, active)
WHERE active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_expires_at 
ON user_sessions(expires_at);

-- Optimize text search if needed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_search 
ON users USING gin(to_tsvector('english', name));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_name_search 
ON services USING gin(to_tsvector('english', name));

-- Add partial indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_upcoming 
ON bookings(date, start_hour) 
WHERE date >= CURRENT_DATE AND status != 'cancelled';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_today 
ON bookings(start_hour, instructor_user_id) 
WHERE date = CURRENT_DATE AND status IN ('confirmed', 'pending');

-- Performance monitoring view
CREATE OR REPLACE VIEW booking_performance_stats AS
SELECT 
    COUNT(*) as total_bookings,
    COUNT(*) FILTER (WHERE date >= CURRENT_DATE) as upcoming_bookings,
    COUNT(*) FILTER (WHERE date = CURRENT_DATE) as today_bookings,
    COUNT(DISTINCT instructor_user_id) as active_instructors,
    COUNT(DISTINCT student_user_id) as active_students,
    AVG(final_amount) as avg_booking_amount
FROM bookings 
WHERE status != 'cancelled';

-- Index usage monitoring function
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE(
    schemaname text,
    tablename text,
    indexname text,
    num_scans bigint,
    num_tup_read bigint,
    num_tup_fetch bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::text,
        s.tablename::text,
        s.indexname::text,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch
    FROM pg_stat_user_indexes s
    ORDER BY s.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_index_usage_stats() IS 'Monitor index usage for performance optimization';
