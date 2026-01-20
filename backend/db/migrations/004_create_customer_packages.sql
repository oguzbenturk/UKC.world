-- Customer Packages Table
-- This table tracks packages purchased by customers and their usage

CREATE TABLE IF NOT EXISTS customer_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    service_package_id UUID NOT NULL REFERENCES service_packages(id),
    
    -- Purchase information
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    purchase_price NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    
    -- Package details (copied from service_package at time of purchase)
    package_name VARCHAR(255) NOT NULL,
    lesson_service_name VARCHAR(255),
    total_hours NUMERIC(5,2) DEFAULT 0,
    
    -- Usage tracking
    used_hours NUMERIC(5,2) DEFAULT 0,
    remaining_hours NUMERIC(5,2) DEFAULT 0,
    
    -- Status and dates
    status VARCHAR(20) DEFAULT 'active', -- active, expired, used_up, cancelled
    expiry_date DATE,
    last_used_date DATE,
    
    -- Additional fields
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT check_hours_valid CHECK (used_hours >= 0 AND remaining_hours >= 0),
    CONSTRAINT check_status_valid CHECK (status IN ('active', 'expired', 'used_up', 'cancelled'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customer_packages_customer_id ON customer_packages(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_status ON customer_packages(status);
CREATE INDEX IF NOT EXISTS idx_customer_packages_expiry ON customer_packages(expiry_date);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_customer_packages_updated_at ON customer_packages;
CREATE TRIGGER update_customer_packages_updated_at
    BEFORE UPDATE ON customer_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_packages_updated_at();

-- Add some sample data for testing
-- (Note: This assumes we have a users table for customers)
-- INSERT INTO customer_packages (customer_id, service_package_id, package_name, lesson_service_name, total_hours, remaining_hours, purchase_price, expiry_date)
-- VALUES 
-- (customer_uuid, package_uuid, 'Sample Package', 'Private Lesson', 6.00, 6.00, 420.00, CURRENT_DATE + INTERVAL '30 days');
