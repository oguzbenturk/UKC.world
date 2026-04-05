-- Fix order_number generation to count by order_number prefix instead of created_at
-- This prevents collisions when orders are backdated (custom created_at)

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    today_date TEXT;
    sequence_num INTEGER;
    result_order_number TEXT;
BEGIN
    today_date := TO_CHAR(NOW(), 'YYYYMMDD');

    -- Count by order_number prefix to avoid collisions with backdated orders
    SELECT COALESCE(
      MAX(SUBSTRING(order_number FROM 'ORD-' || today_date || '-(\d+)')::INTEGER),
      0
    ) + 1
    INTO sequence_num
    FROM shop_orders
    WHERE order_number LIKE 'ORD-' || today_date || '-%';

    -- Format: ORD-YYYYMMDD-XXXX
    result_order_number := 'ORD-' || today_date || '-' || LPAD(sequence_num::TEXT, 4, '0');

    RETURN result_order_number;
END;
$$ LANGUAGE plpgsql;
