-- Self-student support: link a customer to the instructor who personally brought them in,
-- and store a per-instructor self-student commission rate (default 45%).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS self_student_of_instructor_id uuid
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_self_student_of_instructor
  ON users(self_student_of_instructor_id)
  WHERE self_student_of_instructor_id IS NOT NULL;

ALTER TABLE instructor_default_commissions
  ADD COLUMN IF NOT EXISTS self_student_commission_rate numeric(5,2) DEFAULT 45.00;
