-- Migration 200: Add insurance_rate to services table
-- Allows admin to configure an optional insurance rate (%) per rental service.
-- NULL means no insurance is offered for that service.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS insurance_rate DECIMAL(5,2) DEFAULT NULL;

COMMENT ON COLUMN services.insurance_rate IS
  'Optional insurance rate in percent (e.g. 10.00 = 10%). NULL = no insurance offered.';
