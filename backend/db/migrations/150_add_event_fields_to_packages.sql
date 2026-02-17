-- Migration: Add event-specific fields for downwinders and camps packages
-- Purpose: Add scheduling, location, capacity, and itinerary fields for event-based packages

-- Add event-specific fields to service_packages
ALTER TABLE service_packages
ADD COLUMN IF NOT EXISTS event_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS event_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS event_location TEXT,
ADD COLUMN IF NOT EXISTS departure_location TEXT,
ADD COLUMN IF NOT EXISTS destination_location TEXT,
ADD COLUMN IF NOT EXISTS max_participants INTEGER,
ADD COLUMN IF NOT EXISTS current_participants INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_skill_level VARCHAR(50),
ADD COLUMN IF NOT EXISTS min_age INTEGER,
ADD COLUMN IF NOT EXISTS max_age INTEGER,
ADD COLUMN IF NOT EXISTS itinerary JSONB,
ADD COLUMN IF NOT EXISTS event_status VARCHAR(32) DEFAULT 'scheduled';

-- Create indexes for event queries
CREATE INDEX IF NOT EXISTS idx_service_packages_event_start_date 
ON service_packages(event_start_date) 
WHERE event_start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_packages_event_status 
ON service_packages(event_status);

CREATE INDEX IF NOT EXISTS idx_service_packages_event_dates 
ON service_packages(event_start_date, event_end_date) 
WHERE event_start_date IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN service_packages.event_start_date IS 'Start date/time for event-based packages (downwinders, camps)';
COMMENT ON COLUMN service_packages.event_end_date IS 'End date/time for event-based packages';
COMMENT ON COLUMN service_packages.event_location IS 'Primary location for camps or meeting point';
COMMENT ON COLUMN service_packages.departure_location IS 'Departure point for downwinders';
COMMENT ON COLUMN service_packages.destination_location IS 'Destination point for downwinders';
COMMENT ON COLUMN service_packages.max_participants IS 'Maximum capacity for the event';
COMMENT ON COLUMN service_packages.current_participants IS 'Number of participants currently registered';
COMMENT ON COLUMN service_packages.min_skill_level IS 'Minimum skill level required (beginner, intermediate, advanced)';
COMMENT ON COLUMN service_packages.min_age IS 'Minimum age requirement';
COMMENT ON COLUMN service_packages.max_age IS 'Maximum age requirement (null = no limit)';
COMMENT ON COLUMN service_packages.itinerary IS 'Detailed day-by-day schedule in JSON format';
COMMENT ON COLUMN service_packages.event_status IS 'Status: scheduled, full, completed, cancelled';
