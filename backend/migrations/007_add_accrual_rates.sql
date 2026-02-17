-- Migration 007: Add accrual-specific rates to financial_settings
-- Description: Separate cash and accrual mode rates for better calculation control

-- Add accrual-specific rate columns
ALTER TABLE financial_settings 
ADD COLUMN IF NOT EXISTS accrual_tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS accrual_insurance_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS accrual_equipment_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS accrual_payment_method_fees JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update constraints to include accrual rates
ALTER TABLE financial_settings 
DROP CONSTRAINT IF EXISTS chk_rates_range;

ALTER TABLE financial_settings 
ADD CONSTRAINT chk_rates_range CHECK (
  tax_rate_pct >= 0 AND tax_rate_pct <= 100 AND
  insurance_rate_pct >= 0 AND insurance_rate_pct <= 100 AND
  equipment_rate_pct >= 0 AND equipment_rate_pct <= 100 AND
  accrual_tax_rate_pct >= 0 AND accrual_tax_rate_pct <= 100 AND
  accrual_insurance_rate_pct >= 0 AND accrual_insurance_rate_pct <= 100 AND
  accrual_equipment_rate_pct >= 0 AND accrual_equipment_rate_pct <= 100
);

-- Update existing records with default accrual rates (same as cash rates initially)
UPDATE financial_settings 
SET 
  accrual_tax_rate_pct = tax_rate_pct,
  accrual_insurance_rate_pct = insurance_rate_pct,
  accrual_equipment_rate_pct = equipment_rate_pct,
  accrual_payment_method_fees = payment_method_fees
WHERE accrual_tax_rate_pct = 0 AND accrual_insurance_rate_pct = 0 AND accrual_equipment_rate_pct = 0;
