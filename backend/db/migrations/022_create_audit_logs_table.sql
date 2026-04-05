-- Migration: Create audit_logs table for waiver & family auditing
-- Date: 2025-10-14
-- Description: Tracks waiver access/modifications and family member changes with long-term retention

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  actor_user_id UUID REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  family_member_id UUID REFERENCES family_members(id),
  waiver_id UUID REFERENCES liability_waivers(id),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 years')
);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS action VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resource_id UUID,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES family_members(id),
  ADD COLUMN IF NOT EXISTS waiver_id UUID REFERENCES liability_waivers(id),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS retain_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 years');

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_family_member ON audit_logs(family_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_waiver ON audit_logs(waiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_retain_until ON audit_logs(retain_until);

COMMENT ON TABLE audit_logs IS 'Business audit trail for waiver access/modifications and family member changes';
COMMENT ON COLUMN audit_logs.event_type IS 'High-level event namespace (e.g., waiver.view, family_member.update)';
COMMENT ON COLUMN audit_logs.action IS 'CRUD-style action keyword associated with the event';
COMMENT ON COLUMN audit_logs.metadata IS 'Structured metadata captured for compliance reviews';
COMMENT ON COLUMN audit_logs.retain_until IS 'Timestamp indicating minimum retention (>=7 years) for the entry';
