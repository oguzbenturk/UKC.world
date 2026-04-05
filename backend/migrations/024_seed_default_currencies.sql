-- Migration: 024_seed_default_currencies.sql
-- Description: Seed default currencies (EUR, USD, TRY) if they don't exist
-- These are essential currencies that should always be available

-- Insert EUR (Euro) as the base currency
INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
VALUES ('EUR', 'Euro', '€', true, 1.0000, true, 2)
ON CONFLICT (currency_code) DO UPDATE SET
    currency_name = EXCLUDED.currency_name,
    symbol = EXCLUDED.symbol,
    is_active = true;

-- Insert USD (US Dollar)
INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
VALUES ('USD', 'US Dollar', '$', true, 1.0800, false, 2)
ON CONFLICT (currency_code) DO UPDATE SET
    currency_name = EXCLUDED.currency_name,
    symbol = EXCLUDED.symbol,
    is_active = true;

-- Insert TRY (Turkish Lira)
INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
VALUES ('TRY', 'Turkish Lira', '₺', true, 36.5000, false, 2)
ON CONFLICT (currency_code) DO UPDATE SET
    currency_name = EXCLUDED.currency_name,
    symbol = EXCLUDED.symbol,
    is_active = true;

-- Ensure only one base currency exists (EUR should be the base)
UPDATE currency_settings SET base_currency = false WHERE currency_code != 'EUR';
UPDATE currency_settings SET base_currency = true WHERE currency_code = 'EUR';
