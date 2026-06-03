-- Migration: Proposals ("Teklif Hazırla") — branded multi-language price quotes
-- Created: 2026-06-03
-- Description: Staff build a proposal/quote combining services (accommodation,
-- lessons, rentals, packages) and generate a branded multi-language PDF for the
-- customer. The full editable document is stored as JSONB `content` (mirrors the
-- ukc_quote_kit prototype shape); indexed columns drive list/filter/sort and the
-- public shareable link. Customers open `/teklif/:share_code` (no auth).

CREATE TABLE IF NOT EXISTS proposals (
    id                SERIAL PRIMARY KEY,
    share_code        VARCHAR(24) UNIQUE NOT NULL,        -- unguessable public token
    title             VARCHAR(255) NOT NULL,              -- internal staff label
    prepared_for      VARCHAR(255),                       -- recipient name shown on the PDF
    customer_id       UUID REFERENCES users(id) ON DELETE SET NULL, -- optional CRM link (customers live in users)
    language          VARCHAR(5)  NOT NULL DEFAULT 'en',  -- default OUTPUT language (customer can switch)
    currency_code     VARCHAR(3)  NOT NULL DEFAULT 'EUR',
    status            VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | sent | accepted | expired | declined
    valid_until       DATE,                               -- quote expiry (drives "expired")
    -- Totals snapshot (proposal currency) for list views & sorting:
    regular_total     NUMERIC(12,2) DEFAULT 0,
    savings_total     NUMERIC(12,2) DEFAULT 0,
    cash_total        NUMERIC(12,2) DEFAULT 0,
    content           JSONB NOT NULL DEFAULT '{}'::jsonb, -- full editable document (studio3 shape)
    view_count        INTEGER NOT NULL DEFAULT 0,
    last_viewed_at    TIMESTAMPTZ,
    accepted_at       TIMESTAMPTZ,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proposals_share_code ON proposals(share_code);
CREATE INDEX IF NOT EXISTS idx_proposals_customer_id ON proposals(customer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at DESC);
