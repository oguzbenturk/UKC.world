CREATE TABLE IF NOT EXISTS instructor_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'off_day'
    CHECK (type IN ('off_day', 'vacation', 'sick_leave', 'custom')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_instr_avail_lookup ON instructor_availability (instructor_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_instr_avail_pending ON instructor_availability (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_instr_avail_approved_range ON instructor_availability (start_date, end_date) WHERE status = 'approved';
