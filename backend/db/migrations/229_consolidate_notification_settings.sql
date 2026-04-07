-- Migration: 229_consolidate_notification_settings
-- Description: Consolidate notification settings into one authoritative table.
-- Adds granular per-category preference columns and channel delivery columns.
-- Uses IF NOT EXISTS for idempotency (some columns may already exist).
-- Date: 2026-04-07

-- ============================================================
-- Add granular notification category preferences
-- ============================================================

-- Rental notifications (customer + staff alerts)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='rental_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN rental_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Accommodation booking notifications
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='accommodation_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN accommodation_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Shop order notifications
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='shop_order_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN shop_order_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Lesson completion / check-in notifications (student side)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='lesson_updates') THEN
        ALTER TABLE notification_settings ADD COLUMN lesson_updates BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Rating request notifications (student asked to rate instructor)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='rating_requests') THEN
        ALTER TABLE notification_settings ADD COLUMN rating_requests BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Friend request / social notifications
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='social_notifications') THEN
        ALTER TABLE notification_settings ADD COLUMN social_notifications BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Waiver signing reminders
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='waiver_reminders') THEN
        ALTER TABLE notification_settings ADD COLUMN waiver_reminders BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Instructor time-off / availability change alerts (admin/manager only)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='staff_alerts') THEN
        ALTER TABLE notification_settings ADD COLUMN staff_alerts BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================================
-- Channel delivery preferences (already have email + push, add sms)
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_settings' AND column_name='sms_notifications') THEN
        ALTER TABLE notification_settings ADD COLUMN sms_notifications BOOLEAN DEFAULT false;
    END IF;
END $$;

-- ============================================================
-- Comments documenting the consolidated schema
-- ============================================================

COMMENT ON TABLE notification_settings IS 'Authoritative per-user notification preferences. One row per user (UNIQUE on user_id). All columns default to true so absent rows = receive everything.';

COMMENT ON COLUMN notification_settings.new_booking_alerts IS 'Staff: new booking/rental creation alerts. Instructor: assigned lesson alerts.';
COMMENT ON COLUMN notification_settings.booking_updates IS 'Reschedule, cancellation, status changes on existing bookings';
COMMENT ON COLUMN notification_settings.rental_alerts IS 'Rental creation, approval, decline notifications';
COMMENT ON COLUMN notification_settings.accommodation_alerts IS 'Accommodation booking creation/update notifications';
COMMENT ON COLUMN notification_settings.shop_order_alerts IS 'Shop order creation/status notifications';
COMMENT ON COLUMN notification_settings.lesson_updates IS 'Lesson check-in and completion notifications (student side)';
COMMENT ON COLUMN notification_settings.rating_requests IS 'Post-lesson rating request prompts';
COMMENT ON COLUMN notification_settings.social_notifications IS 'Friend requests, accepted requests, social features';
COMMENT ON COLUMN notification_settings.waiver_reminders IS 'Waiver signing reminder notifications';
COMMENT ON COLUMN notification_settings.staff_alerts IS 'Admin/manager-only: instructor time-off requests, system warnings, repair updates';
COMMENT ON COLUMN notification_settings.weather_alerts IS 'Weather condition alerts for upcoming lessons';
COMMENT ON COLUMN notification_settings.payment_notifications IS 'Bank transfer approvals, wallet credits, payment status changes';
COMMENT ON COLUMN notification_settings.general_announcements IS 'General system announcements and updates';
COMMENT ON COLUMN notification_settings.email_notifications IS 'Master toggle: receive email notifications';
COMMENT ON COLUMN notification_settings.push_notifications IS 'Master toggle: receive push/in-app notifications';
COMMENT ON COLUMN notification_settings.sms_notifications IS 'Master toggle: receive SMS notifications (future)';
