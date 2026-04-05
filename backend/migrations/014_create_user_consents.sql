-- 014_create_user_consents.sql
-- Track per-user legal acceptance and communication preferences

CREATE TABLE IF NOT EXISTS user_consents (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ,
  marketing_email_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_terms_version ON user_consents(terms_version);

CREATE OR REPLACE FUNCTION set_user_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_consents_set_updated_at ON user_consents;

CREATE TRIGGER user_consents_set_updated_at
BEFORE UPDATE ON user_consents
FOR EACH ROW
EXECUTE FUNCTION set_user_consents_updated_at();
