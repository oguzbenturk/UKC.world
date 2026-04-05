-- Migration: Add service/equipment/accommodation reference fields to service_packages
-- This allows packages to be linked to specific services, equipment, and accommodation units

-- Add lesson_service_id for linking to a specific lesson service
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS lesson_service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Add equipment_id for linking to specific equipment for rental packages
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL;

-- Add accommodation_unit_id for linking to specific accommodation unit
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS accommodation_unit_id UUID REFERENCES accommodation_units(id) ON DELETE SET NULL;

-- Add rental_service_id for alternative rental service reference
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS rental_service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Add equipment_name for display when equipment is deleted
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS equipment_name VARCHAR(255);

-- Add accommodation_unit_name for display when unit is deleted
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS accommodation_unit_name VARCHAR(255);

-- Add rental_service_name for display when service is deleted
ALTER TABLE service_packages 
ADD COLUMN IF NOT EXISTS rental_service_name VARCHAR(255);

-- Create indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_service_packages_lesson_service_id ON service_packages(lesson_service_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_equipment_id ON service_packages(equipment_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_accommodation_unit_id ON service_packages(accommodation_unit_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_rental_service_id ON service_packages(rental_service_id);

-- Add comments for documentation
COMMENT ON COLUMN service_packages.lesson_service_id IS 'Reference to specific lesson service included in package';
COMMENT ON COLUMN service_packages.equipment_id IS 'Reference to specific equipment included in rental packages';
COMMENT ON COLUMN service_packages.accommodation_unit_id IS 'Reference to specific accommodation unit for stay packages';
COMMENT ON COLUMN service_packages.rental_service_id IS 'Reference to alternative rental service for rental packages';
