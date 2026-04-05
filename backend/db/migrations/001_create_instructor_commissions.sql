-- Migration: Create instructor commissions tables
CREATE TABLE IF NOT EXISTS instructor_default_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id)
);

CREATE TABLE IF NOT EXISTS instructor_service_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  commission_type VARCHAR(20) NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id, service_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_instructor_default_commissions_instructor_id ON instructor_default_commissions(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_service_commissions_instructor_id ON instructor_service_commissions(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_service_commissions_service_id ON instructor_service_commissions(service_id);
