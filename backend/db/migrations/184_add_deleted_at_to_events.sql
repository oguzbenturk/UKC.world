-- Migration 184: Add deleted_at column to events table
-- The events route references e.deleted_at IS NULL for soft-delete support,
-- but the events table is missing this column.

ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at) WHERE deleted_at IS NULL;
