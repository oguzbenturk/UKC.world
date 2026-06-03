-- Migration 270: Add product categories system
-- Promotes top-level categories from a frontend-only constant to a real DB table,
-- so staff can create custom categories (with an icon) that persist and behave like
-- the built-in ones. Mirrors the existing product_subcategories design.

CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    value VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    icon VARCHAR(16) DEFAULT '📦',
    display_order INTEGER DEFAULT 0,
    is_builtin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_active ON product_categories(is_active);

-- Seed the 7 built-in categories (single source of truth historically lived in
-- src/shared/constants/productCategories.js). Marked is_builtin so the UI never
-- offers to delete them.
INSERT INTO product_categories (value, display_name, icon, display_order, is_builtin) VALUES
    ('kitesurf',   'Kiteboarding',    '🪁', 1, true),
    ('wingfoil',   'Wing Foiling',    '🪂', 2, true),
    ('foiling',    'Foiling',         '🏄', 3, true),
    ('efoil',      'E-Foiling',       '⚡', 4, true),
    ('ion',        'ION Accessories', '🩱', 5, true),
    ('ukc-shop',   'UKC Shop',        '👕', 6, true),
    ('secondwind', 'SecondWind',      '♻️', 7, true)
ON CONFLICT (value) DO NOTHING;

-- Keep updated_at fresh on every UPDATE
CREATE OR REPLACE FUNCTION update_product_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_categories_updated_at ON product_categories;
CREATE TRIGGER trigger_update_product_categories_updated_at
BEFORE UPDATE ON product_categories
FOR EACH ROW
EXECUTE FUNCTION update_product_categories_updated_at();

COMMENT ON TABLE product_categories IS 'Top-level product categories (built-in + staff-created custom). category column on products references value.';
