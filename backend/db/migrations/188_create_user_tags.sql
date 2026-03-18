-- Migration 188: Create user_tags table for lightweight badges/achievements
-- Tags users with labels like 'shop_customer' without changing the auth/role system

CREATE TABLE IF NOT EXISTS user_tags (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    label VARCHAR(100),
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags (tag);
CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags (user_id);

-- Backfill: tag all existing users who have completed shop orders as 'shop_customer'
INSERT INTO user_tags (user_id, tag, label, awarded_at, metadata)
SELECT DISTINCT
    so.user_id,
    'shop_customer',
    'Shop Customer',
    MIN(so.created_at),
    '{}'::jsonb
FROM shop_orders so
WHERE so.status NOT IN ('cancelled')
GROUP BY so.user_id
ON CONFLICT (user_id, tag) DO NOTHING;
