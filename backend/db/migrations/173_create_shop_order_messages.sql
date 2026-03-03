-- Shop order messages: per-order communication between customers and staff
CREATE TABLE IF NOT EXISTS shop_order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INTEGER NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_order_messages_order ON shop_order_messages(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_order_messages_user ON shop_order_messages(user_id);
