-- Migration: Create instructor services table
CREATE TABLE IF NOT EXISTS instructor_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instructor_id, service_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_instructor_services_instructor_id ON instructor_services(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_services_service_id ON instructor_services(service_id);
