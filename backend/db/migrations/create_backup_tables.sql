-- Create backup tables for deleted data
-- These tables store copies of deleted records before hard deletion

-- Backup table for bookings
CREATE TABLE IF NOT EXISTS deleted_bookings_backup (
    id UUID PRIMARY KEY,
    original_data JSONB NOT NULL, -- Full original booking data
    deleted_at TIMESTAMP NOT NULL,
    deleted_by UUID,
    deletion_reason TEXT,
    deletion_metadata JSONB,
    backed_up_at TIMESTAMP DEFAULT NOW(),
    scheduled_hard_delete_at TIMESTAMP, -- When this should be permanently deleted
    hard_deleted_at TIMESTAMP NULL -- NULL means not yet hard deleted
);

-- Backup table for related data (commissions, earnings, etc.)
CREATE TABLE IF NOT EXISTS deleted_booking_relations_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL, -- Reference to original booking
    table_name VARCHAR(255) NOT NULL, -- Which table the data came from
    original_data JSONB NOT NULL,
    backed_up_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for backup tables
CREATE INDEX IF NOT EXISTS idx_deleted_bookings_backup_deleted_at ON deleted_bookings_backup(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_bookings_backup_scheduled_delete ON deleted_bookings_backup(scheduled_hard_delete_at);
CREATE INDEX IF NOT EXISTS idx_deleted_relations_booking_id ON deleted_booking_relations_backup(booking_id);

-- Backup table for other entities (instructors, services, etc.)
CREATE TABLE IF NOT EXISTS deleted_entities_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(100) NOT NULL, -- 'instructor', 'service', 'user', etc.
    entity_id UUID NOT NULL,
    original_data JSONB NOT NULL,
    deleted_at TIMESTAMP NOT NULL,
    deleted_by UUID,
    deletion_reason TEXT,
    backed_up_at TIMESTAMP DEFAULT NOW(),
    scheduled_hard_delete_at TIMESTAMP,
    hard_deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_entities_type_id ON deleted_entities_backup(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deleted_entities_scheduled_delete ON deleted_entities_backup(scheduled_hard_delete_at);
