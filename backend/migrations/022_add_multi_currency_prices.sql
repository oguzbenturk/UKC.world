-- Migration: Add multi-currency support for services and packages
-- This allows services and packages to have prices in multiple currencies

-- Table: service_prices
-- Stores prices for services in different currencies
CREATE TABLE IF NOT EXISTS service_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    currency_code VARCHAR(3) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, currency_code)
);

-- Table: package_prices
-- Stores prices for service packages in different currencies
CREATE TABLE IF NOT EXISTS package_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    currency_code VARCHAR(3) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(package_id, currency_code)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_service_prices_service_id ON service_prices(service_id);
CREATE INDEX IF NOT EXISTS idx_service_prices_currency ON service_prices(currency_code);
CREATE INDEX IF NOT EXISTS idx_package_prices_package_id ON package_prices(package_id);
CREATE INDEX IF NOT EXISTS idx_package_prices_currency ON package_prices(currency_code);

-- Migrate existing prices from services table to service_prices
-- This preserves the existing single-currency price as an entry in the new table
INSERT INTO service_prices (service_id, currency_code, price)
SELECT id, COALESCE(currency, 'TRY'), price
FROM services
WHERE price IS NOT NULL AND price > 0
ON CONFLICT (service_id, currency_code) DO NOTHING;

-- Migrate existing prices from service_packages table to package_prices
INSERT INTO package_prices (package_id, currency_code, price)
SELECT id, COALESCE(currency, 'TRY'), price
FROM service_packages
WHERE price IS NOT NULL AND price > 0
ON CONFLICT (package_id, currency_code) DO NOTHING;

-- Add comment explaining the multi-currency setup
COMMENT ON TABLE service_prices IS 'Multi-currency prices for services. Each service can have prices in multiple currencies.';
COMMENT ON TABLE package_prices IS 'Multi-currency prices for service packages. Each package can have prices in multiple currencies.';
