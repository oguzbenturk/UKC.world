-- Migration 004: Create financial_settings table (versioned settings)
-- Description: Global financial settings with versioning and payment method fees

CREATE TABLE IF NOT EXISTS financial_settings (
  id SERIAL PRIMARY KEY,
  tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  insurance_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  equipment_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  payment_method_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rates_range CHECK (
    tax_rate_pct >= 0 AND tax_rate_pct <= 100 AND
    insurance_rate_pct >= 0 AND insurance_rate_pct <= 100 AND
    equipment_rate_pct >= 0 AND equipment_rate_pct <= 100
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_settings_effective_from ON financial_settings (effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_financial_settings_active ON financial_settings (active);

-- Seed a default settings row if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM financial_settings) THEN
    INSERT INTO financial_settings (
      tax_rate_pct, insurance_rate_pct, equipment_rate_pct, payment_method_fees, active
    ) VALUES (
      20.00, 5.00, 5.00,
      '{
        "card": {"pct": 2.90, "fixed": 0.30, "currency": "EUR", "active": true},
        "pos": {"pct": 2.90, "fixed": 0.30, "currency": "EUR", "active": true},
        "mobile_wallet": {"pct": 2.90, "fixed": 0.30, "currency": "EUR", "active": true},
        "cash": {"pct": 0, "fixed": 0, "currency": "EUR", "active": true},
        "bank_transfer": {"pct": 0, "fixed": 0, "currency": "EUR", "active": true},
        "wire": {"pct": 0, "fixed": 0, "currency": "EUR", "active": true}
      }',
      TRUE
    );
  END IF;
END $$;
