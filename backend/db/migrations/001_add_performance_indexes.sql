-- Disabled migration (removed 2025-09-12). No-op.


SET maintenance_work_mem = '512MB';












DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_equipment_type_status 
        ON equipment(type, status);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_equipment_available 
        ON equipment(type, category) 
        WHERE status = 'available';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rentals') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_user_date 
        ON rentals(user_id, rental_date);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_equipment_date 
        ON rentals(equipment_id, rental_date);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_status_date 
        ON rentals(status, rental_date) 
        WHERE status IN ('active', 'pending', 'returned');
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read 
        ON notifications(user_id, read_status, created_at);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread 
        ON notifications(user_id, created_at) 
        WHERE read_status = false;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_instructor_date 
        ON reviews(instructor_id, created_at);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_rating 
        ON reviews(instructor_id, rating) 
        WHERE rating IS NOT NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS query_performance_log (
    id SERIAL PRIMARY KEY,
    query_type VARCHAR(50) NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    rows_affected INTEGER,
    cached BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_query_performance_type_date 
ON query_performance_log(query_type, created_at);

RESET maintenance_work_mem;

COMMENT ON INDEX idx_bookings_date_status IS 'Optimizes booking calendar queries by date and status';
COMMENT ON INDEX idx_bookings_instructor_date IS 'Optimizes instructor schedule queries';
COMMENT ON INDEX idx_bookings_student_date IS 'Optimizes student booking history queries';
COMMENT ON INDEX idx_services_category_level IS 'Optimizes service filtering by category and level';
COMMENT ON INDEX idx_transactions_type_status_date IS 'Optimizes financial reporting queries';

ANALYZE bookings;
ANALYZE services;
ANALYZE users;
ANALYZE transactions;

-- Disabled: Performance optimization indexes no longer required.
-- This migration was intentionally replaced with a no-op to avoid index creation.
-- Keeping the file ensures ordering but prevents execution side-effects.
-- Applied as a no-op by the migration runner.

-- no-op
DO $$
