-- 013_notifications_realtime.sql
-- Enable realtime notification broadcasts via PostgreSQL LISTEN/NOTIFY

DO $$
BEGIN
  -- Ensure the notifications table exists before attaching triggers
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
  ) THEN
    RAISE NOTICE 'notifications table not found, skipping realtime trigger setup';
  ELSE
    -- Create or replace trigger function that publishes notification events
    CREATE OR REPLACE FUNCTION notify_notification_event() RETURNS TRIGGER AS $notify$
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
    $notify$ LANGUAGE plpgsql;

    -- Recreate trigger to ensure it points to the new function
    DROP TRIGGER IF EXISTS notifications_notify_trigger ON notifications;

    CREATE TRIGGER notifications_notify_trigger
    AFTER INSERT OR UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION notify_notification_event();
  END IF;
END;
$$;
