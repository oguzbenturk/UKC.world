-- Migration: Create products table for retail/sales items
-- This is separate from services which are for lessons/rentals

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    category VARCHAR(100) NOT NULL,
    brand VARCHAR(100),
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2), -- For profit margin calculation
    currency VARCHAR(3) DEFAULT 'EUR',
    stock_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 0, -- For low stock alerts
    weight DECIMAL(8,3), -- In kg
    dimensions JSONB, -- {length, width, height} in cm
    image_url TEXT,
    images JSONB, -- Array of image URLs
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, discontinued
    is_featured BOOLEAN DEFAULT false,
    tags JSONB, -- Array of tags for search/filtering
    supplier_info JSONB, -- Supplier details
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_products_currency 
        FOREIGN KEY (currency) 
        REFERENCES currency_settings(currency_code),
    CONSTRAINT fk_products_created_by 
        FOREIGN KEY (created_by) 
        REFERENCES users(id),
    CONSTRAINT fk_products_updated_by 
        FOREIGN KEY (updated_by) 
        REFERENCES users(id),
    CONSTRAINT chk_stock_quantity 
        CHECK (stock_quantity >= 0),
    CONSTRAINT chk_price_positive 
        CHECK (price >= 0),
    CONSTRAINT chk_cost_price_positive 
        CHECK (cost_price IS NULL OR cost_price >= 0)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(brand, '')));

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
CREATE TRIGGER trigger_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_products_updated_at();

-- Insert some sample product categories
INSERT INTO products (name, description, sku, category, brand, price, cost_price, stock_quantity, min_stock_level)
VALUES 
    ('Duotone Click Bar 2025', 'Professional kitesurfing control bar with easy-to-use click system', 'DT-CB-2025', 'equipment', 'Duotone', 299.99, 180.00, 15, 5),
    ('Rebel DLAB Kite', 'High-performance freestyle kite for advanced riders', 'RB-DLAB-2925', 'kites', 'Rebel', 1299.99, 780.00, 8, 3),
    ('TS Big Air SLS', 'Super Light Strong construction for maximum performance', 'TS-BA-SLS', 'kites', 'Core', 1599.99, 960.00, 5, 2),
    ('Dakine Harness Pro', 'Professional kitesurfing harness with maximum comfort', 'DK-HP-BLK', 'harnesses', 'Dakine', 189.99, 110.00, 12, 4),
    ('Mystic Wetsuit 4/3mm', 'High-quality neoprene wetsuit for cold water sessions', 'MY-WS-43', 'wetsuits', 'Mystic', 249.99, 150.00, 10, 3)
ON CONFLICT (sku) DO NOTHING;

COMMENT ON TABLE products IS 'Retail products for sale (equipment, gear, accessories)';
COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit - unique product identifier';
COMMENT ON COLUMN products.cost_price IS 'Purchase/manufacturing cost for profit calculation';
COMMENT ON COLUMN products.stock_quantity IS 'Current inventory level';
COMMENT ON COLUMN products.min_stock_level IS 'Minimum stock before reorder alert';
