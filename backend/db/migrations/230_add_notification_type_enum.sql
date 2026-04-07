-- Migration: 230_add_notification_type_enum
-- Description: Create a notification_type_enum and migrate the notifications.type
-- column from freeform VARCHAR to a validated enum. This prevents typos and
-- documents every notification type the system can produce.
--
-- Strategy: Create enum with all known types + a 'general' catch-all, then
-- ALTER COLUMN with USING to cast existing data. Any rows with unknown types
-- are mapped to 'general' to avoid data loss.
-- Date: 2026-04-07

-- ============================================================
-- Step 1: Create the enum type (IF NOT EXISTS via DO block)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum') THEN
        CREATE TYPE notification_type_enum AS ENUM (
            -- Booking lifecycle
            'booking_student',                -- Student notified about their booking
            'booking_instructor',             -- Instructor notified about assigned lesson
            'new_booking_alert',              -- Admin/manager alert for new booking
            'booking_confirmed',              -- Booking confirmed (partner school, group)
            'booking_declined',               -- Booking declined
            'booking_rescheduled',            -- Booking rescheduled (instructor view)
            'booking_rescheduled_by_admin',   -- Admin rescheduled a booking (student view)
            'booking_checkin_student',        -- Student checked into lesson
            'booking_completed_student',      -- Lesson completed (student view)
            'reschedule_request',             -- Student requested reschedule (manager view)

            -- Rentals
            'rental_customer',                -- Customer rental confirmation
            'new_rental_alert',               -- Admin/manager alert for new rental
            'rental_approved',                -- Rental approved by admin
            'rental_declined',                -- Rental declined by admin

            -- Group bookings
            'group_booking_created',          -- Group booking created alert
            'group_booking_accepted',         -- Group booking accepted
            'group_booking_time_suggestion',  -- Time suggestion for group
            'group_booking_payment',          -- Group booking payment notification

            -- Ratings
            'rating_request',                 -- Student asked to rate instructor
            'lesson_rating_instructor',       -- Instructor received a rating

            -- Financial / payments
            'payment',                        -- Generic payment notification
            'bank_transfer_deposit',          -- Bank transfer deposit received

            -- Shop
            'shop_order',                     -- Shop order notification

            -- Accommodation
            'accommodation_booking',          -- Accommodation booking notification

            -- Package purchase
            'package_purchase',               -- Package purchase notification (staff alert)

            -- Social
            'friend_request',                 -- Friend request sent
            'friend_request_accepted',        -- Friend request accepted

            -- Waivers
            'waiver',                         -- Waiver signing reminder/notification

            -- Weather
            'weather',                        -- Weather alert

            -- Staff / system
            'instructor_time_off_request',    -- Instructor requested time off
            'quick_link_registration',        -- Quick link registration notification
            'repair_update',                  -- Equipment repair status update
            'repair_comment',                 -- Comment on equipment repair

            -- System / catch-all
            'warning',                        -- System warning (e.g. exchange rate failure)
            'general',                        -- Default / uncategorized
            'booking'                         -- Legacy generic booking notification
        );
    END IF;
END $$;

-- ============================================================
-- Step 2: Migrate the column from VARCHAR to enum
-- ============================================================

-- First, map any unknown values to 'general' so the cast doesn't fail
UPDATE notifications
SET type = 'general'
WHERE type IS NULL
   OR type NOT IN (
       'booking_student', 'booking_instructor', 'new_booking_alert',
       'booking_confirmed', 'booking_declined', 'booking_rescheduled',
       'booking_rescheduled_by_admin', 'booking_checkin_student',
       'booking_completed_student', 'reschedule_request',
       'rental_customer', 'new_rental_alert', 'rental_approved', 'rental_declined',
       'group_booking_created', 'group_booking_accepted',
       'group_booking_time_suggestion', 'group_booking_payment',
       'rating_request', 'lesson_rating_instructor',
       'payment', 'bank_transfer_deposit',
       'shop_order', 'accommodation_booking', 'package_purchase',
       'friend_request', 'friend_request_accepted',
       'waiver', 'weather',
       'instructor_time_off_request', 'quick_link_registration',
       'repair_update', 'repair_comment',
       'warning', 'general', 'booking'
   );

-- Drop the old default before converting type
ALTER TABLE notifications
    ALTER COLUMN type DROP DEFAULT;

-- Now safe to alter the column type
ALTER TABLE notifications
    ALTER COLUMN type TYPE notification_type_enum
    USING type::notification_type_enum;

-- Set the new enum default
ALTER TABLE notifications
    ALTER COLUMN type SET DEFAULT 'general'::notification_type_enum;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TYPE notification_type_enum IS 'All valid notification types in the Plannivo platform. Add new values via ALTER TYPE ... ADD VALUE before using them in code.';
