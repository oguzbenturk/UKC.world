-- Backfill booking_custom_commissions for any existing booking whose student
-- is currently linked as a self-student of that booking's instructor.
-- Skips bookings that already have a custom commission row (admin overrides win).

INSERT INTO booking_custom_commissions
  (booking_id, instructor_id, service_id, commission_type, commission_value, created_at, updated_at)
SELECT b.id,
       b.instructor_user_id,
       b.service_id,
       'percentage',
       COALESCE(idc.self_student_commission_rate, 45),
       NOW(),
       NOW()
  FROM bookings b
  JOIN users s ON s.id = b.student_user_id
  LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
 WHERE b.deleted_at IS NULL
   AND b.service_id IS NOT NULL
   AND b.instructor_user_id IS NOT NULL
   AND s.self_student_of_instructor_id = b.instructor_user_id
   AND NOT EXISTS (
     SELECT 1 FROM booking_custom_commissions bcc WHERE bcc.booking_id = b.id
   );
