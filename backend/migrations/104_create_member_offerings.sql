-- Migration: 103_create_member_offerings.sql
-- Description: Create tables for member offerings and purchases
-- Created: 2025-01-20

-- ============================================
-- Table: member_offerings
-- Stores VIP membership packages and seasonal offerings
-- ============================================
CREATE TABLE IF NOT EXISTS member_offerings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  period VARCHAR(50) NOT NULL DEFAULT 'season', -- 'day', 'month', 'season', 'year'
  features JSONB DEFAULT '[]'::jsonb, -- Array of feature strings
  icon VARCHAR(50) DEFAULT 'star', -- Icon identifier: crown, star, trophy, thunder, gift
  badge VARCHAR(100), -- Optional badge text like "Most Popular", "Best Value"
  badge_color VARCHAR(50) DEFAULT 'blue', -- Ant Design tag color
  highlighted BOOLEAN DEFAULT FALSE, -- Feature this offering prominently
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  duration_days INT, -- For calculating expiration (NULL = no expiration)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: member_purchases
-- Records purchases/subscriptions made by users
-- ============================================
CREATE TABLE IF NOT EXISTS member_purchases (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offering_id INT NOT NULL REFERENCES member_offerings(id) ON DELETE CASCADE,
  offering_name VARCHAR(255) NOT NULL, -- Snapshot of offering name at purchase time
  offering_price DECIMAL(10, 2) NOT NULL, -- Snapshot of price at purchase time
  offering_currency VARCHAR(3) DEFAULT 'EUR', -- Currency at purchase time
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = never expires
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'cancelled', 'pending'
  payment_method VARCHAR(50) DEFAULT 'cash', -- 'wallet', 'cash', 'card', 'transfer'
  payment_status VARCHAR(50) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
  notes TEXT,
  created_by UUID, -- Admin who processed the purchase (if applicable)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_member_offerings_active ON member_offerings(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_member_offerings_sort ON member_offerings(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_member_purchases_user ON member_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_member_purchases_offering ON member_purchases(offering_id);
CREATE INDEX IF NOT EXISTS idx_member_purchases_status ON member_purchases(status);
CREATE INDEX IF NOT EXISTS idx_member_purchases_user_status ON member_purchases(user_id, status);
CREATE INDEX IF NOT EXISTS idx_member_purchases_expires ON member_purchases(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- Seed default offerings
-- ============================================
INSERT INTO member_offerings (name, description, price, period, features, icon, badge, badge_color, highlighted, sort_order, duration_days) VALUES
(
  'VIP Membership',
  'Get unlimited access to all facilities and priority booking',
  1999.00,
  'year',
  '["Unlimited beach access", "Priority booking for lessons", "Free equipment storage", "20% discount on rentals", "Exclusive VIP events access", "Personal locker included"]'::jsonb,
  'crown',
  'Most Popular',
  'blue',
  TRUE,
  1,
  365
),
(
  'Seasonal Beach Access',
  'Enjoy full beach access throughout the season',
  499.00,
  'season',
  '["Full season beach access", "Beach lounge chair included", "Shower & changing room access", "Wi-Fi access", "10% discount on lessons"]'::jsonb,
  'star',
  NULL,
  'blue',
  FALSE,
  2,
  120
),
(
  'Seasonal Equipment Storage',
  'Secure storage for your kitesurfing equipment',
  299.00,
  'season',
  '["Climate-controlled storage", "24/7 security monitoring", "Equipment maintenance area", "Quick access system", "Insurance included"]'::jsonb,
  'trophy',
  NULL,
  'blue',
  FALSE,
  3,
  120
),
(
  'Seasonal Kite Rental',
  'Unlimited kite rentals throughout the season',
  899.00,
  'season',
  '["Unlimited kite rentals", "All kite sizes available", "Latest equipment models", "Free equipment maintenance", "No booking fees", "Priority equipment access"]'::jsonb,
  'thunder',
  'Best Value',
  'cyan',
  FALSE,
  4,
  120
),
(
  'Day Pass',
  'Single day access to all facilities',
  25.00,
  'day',
  '["Full day beach access", "Shower & changing room", "Wi-Fi access", "Lounge chair", "Valid for 1 day"]'::jsonb,
  'gift',
  NULL,
  'blue',
  FALSE,
  5,
  1
),
(
  'Premium Storage + Rental',
  'Combined storage and rental package with extra perks',
  1099.00,
  'season',
  '["Equipment storage included", "Unlimited kite rentals", "Free wetsuit storage", "15% discount on lessons", "Priority booking access", "Exclusive member events"]'::jsonb,
  'crown',
  'Bundle Deal',
  'green',
  FALSE,
  6,
  120
)
ON CONFLICT DO NOTHING;

-- ============================================
-- Update trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_member_offerings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_offerings_updated_at ON member_offerings;
CREATE TRIGGER trigger_member_offerings_updated_at
  BEFORE UPDATE ON member_offerings
  FOR EACH ROW
  EXECUTE FUNCTION update_member_offerings_updated_at();

CREATE OR REPLACE FUNCTION update_member_purchases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_purchases_updated_at ON member_purchases;
CREATE TRIGGER trigger_member_purchases_updated_at
  BEFORE UPDATE ON member_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_member_purchases_updated_at();

-- ============================================
-- Function to auto-expire purchases
-- Can be called by a cron job or scheduled task
-- ============================================
CREATE OR REPLACE FUNCTION expire_member_purchases()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE member_purchases
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
