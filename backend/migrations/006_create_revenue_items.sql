-- Migration 006: Create revenue_items table for unified revenue snapshots

CREATE TABLE IF NOT EXISTS revenue_items (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- booking | rental | accommodation
  entity_id INTEGER NOT NULL,
  service_type VARCHAR(50), -- lesson | rental | accommodation | product | other
  service_id INTEGER,
  category_id INTEGER,
  fulfillment_date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
  exchange_rate NUMERIC(12,6),
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  equipment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50),
  payment_fee_pct NUMERIC(5,2),
  payment_fee_fixed NUMERIC(12,2),
  payment_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  custom_costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  settings_version_id INTEGER REFERENCES financial_settings(id),
  components JSONB NOT NULL DEFAULT '{}'::jsonb, -- optional detail (commission_components etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_revenue_items_entity ON revenue_items (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_revenue_items_fulfillment_date ON revenue_items (fulfillment_date);
CREATE INDEX IF NOT EXISTS idx_revenue_items_service ON revenue_items (service_type, service_id);
