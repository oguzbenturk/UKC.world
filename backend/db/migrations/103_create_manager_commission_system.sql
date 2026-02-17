-- Migration: 103_create_manager_commission_system
-- Description: Create tables for manager commission tracking and payouts
-- Created: 2026-01-14

-- ============================================
-- Table: manager_commission_settings
-- Stores commission rate configuration per manager
-- ============================================
CREATE TABLE IF NOT EXISTS manager_commission_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Commission configuration
    commission_type VARCHAR(50) NOT NULL DEFAULT 'flat', -- flat, per_category, tiered
    default_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00, -- Default percentage (e.g., 10.00 = 10%)
    
    -- Per-category rates (used when commission_type = 'per_category')
    booking_rate DECIMAL(5,2) DEFAULT NULL,
    rental_rate DECIMAL(5,2) DEFAULT NULL,
    accommodation_rate DECIMAL(5,2) DEFAULT NULL,
    package_rate DECIMAL(5,2) DEFAULT NULL,
    
    -- Tiered settings (JSONB for flexibility)
    -- Example: [{"min": 0, "max": 5000, "rate": 8}, {"min": 5001, "max": 15000, "rate": 10}, {"min": 15001, "max": null, "rate": 12}]
    tier_settings JSONB DEFAULT NULL,
    
    -- Status and validity
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE DEFAULT NULL,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one active setting per manager
    CONSTRAINT unique_active_manager_setting UNIQUE (manager_user_id, is_active) 
        DEFERRABLE INITIALLY DEFERRED
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_manager_commission_settings_manager 
    ON manager_commission_settings(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_manager_commission_settings_active 
    ON manager_commission_settings(is_active) WHERE is_active = true;

-- ============================================
-- Table: manager_commissions
-- Individual commission records for each completed booking/rental
-- ============================================
CREATE TABLE IF NOT EXISTS manager_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Source of the commission
    source_type VARCHAR(50) NOT NULL, -- booking, rental, accommodation, package
    source_id UUID NOT NULL, -- FK to bookings, rentals, etc.
    
    -- Financial details
    source_amount DECIMAL(12,2) NOT NULL, -- Original transaction amount
    source_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    commission_rate DECIMAL(5,2) NOT NULL, -- Rate applied (e.g., 10.00 = 10%)
    commission_amount DECIMAL(12,2) NOT NULL, -- Calculated commission
    commission_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    
    -- Period tracking
    period_month VARCHAR(7) NOT NULL, -- YYYY-MM format for grouping
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, paid, cancelled
    
    -- Important dates
    source_date DATE NOT NULL, -- When the source transaction occurred
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    approved_by UUID REFERENCES users(id) DEFAULT NULL,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    -- References
    payout_id UUID DEFAULT NULL, -- Will be set when included in a payout
    payment_reference VARCHAR(255) DEFAULT NULL,
    
    -- Additional info
    notes TEXT DEFAULT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_manager_commissions_manager 
    ON manager_commissions(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_source 
    ON manager_commissions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_period 
    ON manager_commissions(period_month);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_status 
    ON manager_commissions(status);
CREATE INDEX IF NOT EXISTS idx_manager_commissions_payout 
    ON manager_commissions(payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manager_commissions_source_date 
    ON manager_commissions(source_date);

-- Prevent duplicate commissions for same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_commissions_unique_source 
    ON manager_commissions(manager_user_id, source_type, source_id);

-- ============================================
-- Table: manager_payouts
-- Grouped payout records for payment processing
-- ============================================
CREATE TABLE IF NOT EXISTS manager_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Period covered
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Revenue breakdown
    total_bookings_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_rentals_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_accommodation_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_packages_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_other_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Commission calculation
    gross_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
    deductions DECIMAL(12,2) NOT NULL DEFAULT 0, -- For refunds, adjustments
    net_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    
    -- Status workflow
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, paid, rejected
    
    -- Payment info
    payment_method VARCHAR(50) DEFAULT NULL, -- bank_transfer, wallet, external
    payment_reference VARCHAR(255) DEFAULT NULL,
    payment_date DATE DEFAULT NULL,
    
    -- Approval workflow
    approved_by UUID REFERENCES users(id) DEFAULT NULL,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    rejected_by UUID REFERENCES users(id) DEFAULT NULL,
    rejected_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    rejection_reason TEXT DEFAULT NULL,
    
    -- Additional info
    notes TEXT DEFAULT NULL,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manager_payouts_manager 
    ON manager_payouts(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_manager_payouts_status 
    ON manager_payouts(status);
CREATE INDEX IF NOT EXISTS idx_manager_payouts_period 
    ON manager_payouts(period_start, period_end);

-- ============================================
-- Table: manager_payout_items
-- Links individual commissions to payouts
-- ============================================
CREATE TABLE IF NOT EXISTS manager_payout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES manager_payouts(id) ON DELETE CASCADE,
    commission_id UUID NOT NULL REFERENCES manager_commissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate items
    CONSTRAINT unique_payout_commission UNIQUE (payout_id, commission_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manager_payout_items_payout 
    ON manager_payout_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_manager_payout_items_commission 
    ON manager_payout_items(commission_id);

-- ============================================
-- Update triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_manager_commission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_manager_commission_settings_timestamp ON manager_commission_settings;
CREATE TRIGGER update_manager_commission_settings_timestamp
    BEFORE UPDATE ON manager_commission_settings
    FOR EACH ROW EXECUTE FUNCTION update_manager_commission_timestamp();

DROP TRIGGER IF EXISTS update_manager_commissions_timestamp ON manager_commissions;
CREATE TRIGGER update_manager_commissions_timestamp
    BEFORE UPDATE ON manager_commissions
    FOR EACH ROW EXECUTE FUNCTION update_manager_commission_timestamp();

DROP TRIGGER IF EXISTS update_manager_payouts_timestamp ON manager_payouts;
CREATE TRIGGER update_manager_payouts_timestamp
    BEFORE UPDATE ON manager_payouts
    FOR EACH ROW EXECUTE FUNCTION update_manager_commission_timestamp();

-- ============================================
-- Add foreign key from commissions to payouts
-- (done after both tables exist)
-- ============================================
ALTER TABLE manager_commissions 
    DROP CONSTRAINT IF EXISTS fk_manager_commissions_payout;
    
ALTER TABLE manager_commissions 
    ADD CONSTRAINT fk_manager_commissions_payout 
    FOREIGN KEY (payout_id) REFERENCES manager_payouts(id) ON DELETE SET NULL;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE manager_commission_settings IS 'Commission rate configuration for each manager';
COMMENT ON TABLE manager_commissions IS 'Individual commission records for completed bookings/rentals';
COMMENT ON TABLE manager_payouts IS 'Grouped payout records for payment processing';
COMMENT ON TABLE manager_payout_items IS 'Links commissions to payouts for audit trail';

COMMENT ON COLUMN manager_commission_settings.commission_type IS 'Type: flat (single rate), per_category (different rates), tiered (volume-based)';
COMMENT ON COLUMN manager_commission_settings.default_rate IS 'Default commission percentage (e.g., 10.00 = 10%)';
COMMENT ON COLUMN manager_commissions.source_type IS 'Type of revenue source: booking, rental, accommodation, package';
COMMENT ON COLUMN manager_commissions.period_month IS 'YYYY-MM format for grouping commissions by month';
COMMENT ON COLUMN manager_commissions.status IS 'Status: pending (calculated), approved (verified), paid (transferred), cancelled';
COMMENT ON COLUMN manager_payouts.status IS 'Status: draft, pending_approval, approved, paid, rejected';
