-- Migration: Proposal templates — reusable teklif blueprints
-- Created: 2026-06-03
-- Adds is_template flag so a proposal can be saved as a reusable template
-- (shown in the Quick Create wizard, hidden from the normal proposals list).

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_proposals_is_template ON proposals(is_template) WHERE is_template = true;
