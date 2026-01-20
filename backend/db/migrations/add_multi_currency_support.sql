-- Multi-Currency Support Migration
-- This migration adds comprehensive multi-currency support to the application

-- Create currency settings table
CREATE TABLE IF NOT EXISTS currency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code VARCHAR(3) NOT NULL UNIQUE,
    currency_name VARCHAR(50) NOT NULL,
    symbol VARCHAR(5) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    exchange_rate DECIMAL(10,4) DEFAULT 1.0,
    base_currency BOOLEAN DEFAULT false,
    decimal_places INTEGER DEFAULT 2,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add currency columns to core tables
ALTER TABLE services ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_currency ON services(currency);
CREATE INDEX IF NOT EXISTS idx_bookings_currency ON bookings(currency);
CREATE INDEX IF NOT EXISTS idx_currency_settings_active ON currency_settings(is_active);

-- Insert default currencies
INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places) VALUES
('EUR', 'Euro', '€', true, 1.0000, true, 2),
('USD', 'US Dollar', '$', true, 1.1000, false, 2),
('TRY', 'Turkish Lira', '₺', true, 32.5000, false, 2),
('GBP', 'British Pound', '£', true, 0.8500, false, 2),
('CAD', 'Canadian Dollar', 'C$', false, 1.4500, false, 2),
('AUD', 'Australian Dollar', 'A$', false, 1.6500, false, 2)
ON CONFLICT (currency_code) DO NOTHING;

-- Update existing records to have currency
UPDATE services SET currency = 'EUR' WHERE currency IS NULL;
UPDATE bookings SET currency = 'EUR' WHERE currency IS NULL;
UPDATE service_packages SET currency = 'EUR' WHERE currency IS NULL;

-- Add constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_services_currency'
    ) THEN
        ALTER TABLE services ADD CONSTRAINT fk_services_currency 
            FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookings_currency'
    ) THEN
        ALTER TABLE bookings ADD CONSTRAINT fk_bookings_currency 
            FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_packages_currency'
    ) THEN
        ALTER TABLE service_packages ADD CONSTRAINT fk_packages_currency 
            FOREIGN KEY (currency) REFERENCES currency_settings(currency_code);
    END IF;
END $$;
