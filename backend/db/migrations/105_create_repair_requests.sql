-- Migration: Create repair_requests table
-- Description: Store equipment/facility repair requests from all users

CREATE TABLE IF NOT EXISTS repair_requests (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  equipment_type VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  photos JSONB DEFAULT '[]',
  priority VARCHAR(50) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  location VARCHAR(255),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repair_requests_user ON repair_requests(user_id);
CREATE INDEX idx_repair_requests_status ON repair_requests(status);
CREATE INDEX idx_repair_requests_priority ON repair_requests(priority);
CREATE INDEX idx_repair_requests_assigned ON repair_requests(assigned_to);
