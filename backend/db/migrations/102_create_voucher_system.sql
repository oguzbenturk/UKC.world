-- Migration: 102_create_voucher_system
-- Description: Create tables for voucher/promo code/gift system
-- Date: 2026-01-14

-- ============================================
-- Table: voucher_campaigns (optional grouping)
-- ============================================
CREATE TABLE IF NOT EXISTS voucher_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    budget_limit NUMERIC(12, 2),
    total_spent NUMERIC(12, 2) DEFAULT 0,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Table: voucher_codes (main table)
-- ============================================
CREATE TABLE IF NOT EXISTS voucher_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The actual code users type in
    code VARCHAR(50) NOT NULL UNIQUE,
    
    -- Internal name and description
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Voucher type: percentage, fixed_amount, wallet_credit, free_service, package_upgrade
    voucher_type VARCHAR(50) NOT NULL CHECK (voucher_type IN ('percentage', 'fixed_amount', 'wallet_credit', 'free_service', 'package_upgrade')),
    
    -- Value (percentage or fixed amount depending on type)
    discount_value NUMERIC(12, 2) NOT NULL,
    
    -- For percentage discounts, cap the max discount
    max_discount NUMERIC(12, 2),
    
    -- Minimum purchase amount required
    min_purchase_amount NUMERIC(12, 2) DEFAULT 0,
    
    -- Currency for fixed amounts (NULL means use transaction currency)
    currency VARCHAR(3),
    
    -- What this voucher applies to: all, lessons, rentals, accommodation, packages, wallet
    applies_to VARCHAR(50) DEFAULT 'all' CHECK (applies_to IN ('all', 'lessons', 'rentals', 'accommodation', 'packages', 'wallet', 'specific')),
    
    -- Specific IDs this applies to (for 'specific' applies_to)
    applies_to_ids JSONB DEFAULT '[]'::jsonb,
    
    -- IDs to exclude from discount
    excludes_ids JSONB DEFAULT '[]'::jsonb,
    
    -- Usage type: single_global, single_per_user, multi_limited, multi_per_user, unlimited
    usage_type VARCHAR(50) DEFAULT 'single_per_user' CHECK (usage_type IN ('single_global', 'single_per_user', 'multi_limited', 'multi_per_user', 'unlimited')),
    
    -- Maximum total uses (for multi_limited)
    max_total_uses INTEGER,
    
    -- Maximum uses per user (for multi_per_user)
    max_uses_per_user INTEGER DEFAULT 1,
    
    -- Current usage counter
    total_uses INTEGER DEFAULT 0,
    
    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Visibility: public (anyone can use), private (assigned users only), role_based
    visibility VARCHAR(50) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'role_based')),
    
    -- User restrictions
    requires_first_purchase BOOLEAN DEFAULT false,
    allowed_roles JSONB DEFAULT NULL, -- NULL = all roles, or ['student', 'outsider']
    allowed_user_ids JSONB DEFAULT NULL, -- NULL = public, or ['uuid1', 'uuid2']
    
    -- Combination rules
    can_combine BOOLEAN DEFAULT false,
    
    -- Campaign reference
    campaign_id UUID REFERENCES voucher_campaigns(id) ON DELETE SET NULL,
    
    -- Metadata for free_service or package_upgrade
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case-insensitive unique index on code
CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_codes_code_lower ON voucher_codes (LOWER(code));

-- Index for active codes lookup
CREATE INDEX IF NOT EXISTS idx_voucher_codes_active ON voucher_codes (is_active, valid_from, valid_until) WHERE is_active = true;

-- Index for campaign grouping
CREATE INDEX IF NOT EXISTS idx_voucher_codes_campaign ON voucher_codes (campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================
-- Table: voucher_redemptions (usage tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to the voucher code
    voucher_code_id UUID NOT NULL REFERENCES voucher_codes(id) ON DELETE CASCADE,
    
    -- Who redeemed it
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- When
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- What it was applied to: booking, package, rental, accommodation, wallet
    applied_to_type VARCHAR(50) NOT NULL CHECK (applied_to_type IN ('booking', 'package', 'rental', 'accommodation', 'wallet')),
    
    -- The specific entity ID
    applied_to_id UUID,
    
    -- Financial details
    original_amount NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL,
    final_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    
    -- Status: applied, refunded, cancelled
    status VARCHAR(50) DEFAULT 'applied' CHECK (status IN ('applied', 'refunded', 'cancelled')),
    
    -- Extra info
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user's redemption history
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions (user_id, redeemed_at DESC);

-- Index for voucher usage analysis
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions (voucher_code_id, status);

-- Index for entity lookup (find what discounts applied to a booking)
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_entity ON voucher_redemptions (applied_to_type, applied_to_id);

-- ============================================
-- Table: user_vouchers (assigned vouchers)
-- ============================================
CREATE TABLE IF NOT EXISTS user_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The user this voucher is assigned to
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- The voucher code
    voucher_code_id UUID NOT NULL REFERENCES voucher_codes(id) ON DELETE CASCADE,
    
    -- When assigned
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Who assigned it
    assigned_by UUID REFERENCES users(id),
    
    -- Usage status
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    redemption_id UUID REFERENCES voucher_redemptions(id),
    
    -- Admin notes
    notes TEXT,
    
    -- Prevent duplicate assignments
    UNIQUE(user_id, voucher_code_id)
);

-- Index for user's available vouchers
CREATE INDEX IF NOT EXISTS idx_user_vouchers_user ON user_vouchers (user_id, is_used);

-- Index for voucher assignment tracking
CREATE INDEX IF NOT EXISTS idx_user_vouchers_voucher ON user_vouchers (voucher_code_id);

-- ============================================
-- Trigger: Update updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_voucher_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_voucher_codes_updated_at ON voucher_codes;
CREATE TRIGGER trigger_voucher_codes_updated_at
    BEFORE UPDATE ON voucher_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_voucher_updated_at();

DROP TRIGGER IF EXISTS trigger_voucher_campaigns_updated_at ON voucher_campaigns;
CREATE TRIGGER trigger_voucher_campaigns_updated_at
    BEFORE UPDATE ON voucher_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_voucher_updated_at();

DROP TRIGGER IF EXISTS trigger_voucher_redemptions_updated_at ON voucher_redemptions;
CREATE TRIGGER trigger_voucher_redemptions_updated_at
    BEFORE UPDATE ON voucher_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION update_voucher_updated_at();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE voucher_codes IS 'Main table for promo codes, gift vouchers, and discount codes';
COMMENT ON TABLE voucher_redemptions IS 'Tracks every time a voucher code is redeemed';
COMMENT ON TABLE voucher_campaigns IS 'Optional grouping of voucher codes into marketing campaigns';
COMMENT ON TABLE user_vouchers IS 'Vouchers assigned to specific users (gift cards, VIP codes)';

COMMENT ON COLUMN voucher_codes.voucher_type IS 'percentage=X% off, fixed_amount=€X off, wallet_credit=add to wallet, free_service=grant free item, package_upgrade=add hours/days';
COMMENT ON COLUMN voucher_codes.applies_to IS 'What category this discount applies to';
COMMENT ON COLUMN voucher_codes.usage_type IS 'single_global=one use ever, single_per_user=one per person, multi_limited=N total, multi_per_user=N per person';
COMMENT ON COLUMN voucher_codes.visibility IS 'public=anyone can use, private=must be assigned, role_based=specific roles only';
