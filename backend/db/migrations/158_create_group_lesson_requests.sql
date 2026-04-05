-- Migration 158: Create group lesson requests table
-- Allows solo students to request a group lesson and be matched by management

CREATE TABLE IF NOT EXISTS group_lesson_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  
  -- Scheduling preferences
  preferred_date_start DATE NOT NULL,
  preferred_date_end DATE,  -- NULL means single specific date
  preferred_time_of_day VARCHAR(20) DEFAULT 'any' CHECK (preferred_time_of_day IN ('morning', 'afternoon', 'evening', 'any')),
  preferred_duration_hours DECIMAL(4,2) DEFAULT 1.0,
  
  -- Student profile for matching
  skill_level VARCHAR(20) DEFAULT 'beginner' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'any')),
  notes TEXT,
  
  -- Matching outcome
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'cancelled', 'expired')),
  matched_group_booking_id UUID REFERENCES group_bookings(id) ON DELETE SET NULL,
  matched_at TIMESTAMP WITH TIME ZONE,
  matched_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_user_id ON group_lesson_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_status ON group_lesson_requests(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_service_id ON group_lesson_requests(service_id);
CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_preferred_date ON group_lesson_requests(preferred_date_start, preferred_date_end) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_lesson_requests_skill_level ON group_lesson_requests(skill_level) WHERE status = 'pending' AND deleted_at IS NULL;
