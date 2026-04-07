-- Migration: 228_ensure_notification_realtime_trigger
-- Description: Ensure the LISTEN/NOTIFY trigger exists on the notifications table
-- so real-time WebSocket push works for every insert/update.
-- The function and trigger may already exist (created in 013_notifications_realtime.sql),
-- so we use CREATE OR REPLACE / IF NOT EXISTS for idempotency.
-- Date: 2026-04-07

-- Recreate the trigger function with correct payload shape
CREATE OR REPLACE FUNCTION notify_notification_event()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
    target RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        target := NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Skip updates that do not change anything meaningful
        IF ROW(NEW.*) IS NOT DISTINCT FROM ROW(OLD.*) THEN
            RETURN NEW;
        END IF;
        target := NEW;
    ELSE
        RETURN NEW;
    END IF;

    payload := json_build_object(
        'operation', TG_OP,
        'notification', row_to_json(target)
    );

    PERFORM pg_notify('notification_events', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is attached (drop + recreate to guarantee it fires on INSERT and UPDATE)
DROP TRIGGER IF EXISTS notifications_notify_trigger ON notifications;
CREATE TRIGGER notifications_notify_trigger
    AFTER INSERT OR UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION notify_notification_event();

COMMENT ON FUNCTION notify_notification_event()
    IS 'Publishes notification row changes to pg_notify channel "notification_events" for real-time WebSocket delivery';
