-- Classify instructor_earnings rows attached to soft-deleted bookings.
-- KEEP-SAFE logic:
--   dup    = live booking exists, same instructor + same student + same date -> leftover is a duplicate
--   nottaught = deleted booking never reached 'completed' -> lesson not taught
--   REVIEW = completed lesson, no replacement -> possible lost instructor pay
SELECT
  CASE
    WHEN repl.same_student > 0 THEN 'dup'
    WHEN b.status <> 'completed' THEN 'nottaught'
    ELSE 'REVIEW'
  END AS class,
  b.id AS booking_id, b.date AS lesson, b.start_hour AS hr, b.duration AS dur,
  b.status, b.payment_status AS pay, b.deleted_at::date AS del_on,
  COALESCE(left(b.deletion_reason, 28),'') AS reason,
  COALESCE(su.name,'?') AS student, COALESCE(iu.name,'?') AS instructor,
  ie.total_earnings AS earn,
  repl.same_student AS repl_stud, repl.same_day AS repl_day
FROM instructor_earnings ie
JOIN bookings b ON b.id = ie.booking_id
LEFT JOIN users su ON su.id = b.student_user_id
LEFT JOIN users iu ON iu.id = b.instructor_user_id
JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE r.student_user_id = b.student_user_id) AS same_student,
    count(*) AS same_day
  FROM bookings r
  WHERE r.deleted_at IS NULL AND r.status <> 'cancelled'
    AND r.instructor_user_id = b.instructor_user_id
    AND r.date = b.date
    AND r.id <> b.id
) repl ON true
WHERE b.deleted_at IS NOT NULL AND ie.payroll_id IS NULL
ORDER BY 1, b.date;
