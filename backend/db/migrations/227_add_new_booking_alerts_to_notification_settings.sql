-- Migration: 227_add_new_booking_alerts_to_notification_settings
-- Description: Add new_booking_alerts column to notification_settings table.
-- This column already exists in production (added manually) but has no migration,
-- so IF NOT EXISTS ensures idempotency on existing DBs while fixing fresh setups.
-- Date: 2026-04-07

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notification_settings'
          AND column_name = 'new_booking_alerts'
    ) THEN
        ALTER TABLE notification_settings
            ADD COLUMN new_booking_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

COMMENT ON COLUMN notification_settings.new_booking_alerts
    IS 'When false, user does not receive new_booking_alert / booking_instructor notifications';
