-- Migration 005: Create financial_settings_overrides table
-- Description: Scoped overrides for financial settings (service_type, service_id, category, payment_method)

CREATE TABLE IF NOT EXISTS financial_settings_overrides (
  id SERIAL PRIMARY KEY,
  settings_id INTEGER NOT NULL REFERENCES financial_settings(id) ON DELETE CASCADE,
  scope_type VARCHAR(50) NOT NULL,
  scope_value VARCHAR(255) NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  precedence INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fs_overrides_scope ON financial_settings_overrides (scope_type, scope_value);
CREATE INDEX IF NOT EXISTS idx_fs_overrides_settings ON financial_settings_overrides (settings_id);
CREATE INDEX IF NOT EXISTS idx_fs_overrides_active ON financial_settings_overrides (active);
