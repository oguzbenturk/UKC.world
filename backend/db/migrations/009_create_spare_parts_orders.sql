-- 009_create_spare_parts_orders.sql
-- Create table for tracking spare parts orders

CREATE TABLE IF NOT EXISTS spare_parts_orders (
  id SERIAL PRIMARY KEY,
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
  notes TEXT,
  created_by INTEGER,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spare_parts_orders_status_idx ON spare_parts_orders(status);
CREATE INDEX IF NOT EXISTS spare_parts_orders_created_at_idx ON spare_parts_orders(created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_spare_parts_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spare_parts_orders_updated_at ON spare_parts_orders;
CREATE TRIGGER trg_spare_parts_orders_updated_at
BEFORE UPDATE ON spare_parts_orders
FOR EACH ROW EXECUTE FUNCTION set_spare_parts_orders_updated_at();
