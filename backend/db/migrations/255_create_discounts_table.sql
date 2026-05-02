-- 255_create_discounts_table.sql
--
-- Per-customer manual percentage discounts. Independent from the voucher
-- system: vouchers populate booking columns at creation; this table records
-- staff-applied adjustments after the fact, on any line item type.
--
-- One discount row per (entity_type, entity_id) pair. Re-applying with a new
-- percent UPSERTs. The `amount` is computed and locked in at apply time so a
-- post-hoc edit to the source record's price doesn't silently change history.
--
-- entity_id is TEXT because the various source tables use mixed id types:
-- bookings/rentals/accommodation_bookings/customer_packages = UUID; while
-- member_purchases/shop_orders = INTEGER (SERIAL).

BEGIN;

CREATE TABLE IF NOT EXISTS discounts (
  id            SERIAL PRIMARY KEY,
  customer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   VARCHAR(40) NOT NULL,
  entity_id     TEXT NOT NULL,
  percent       NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency      VARCHAR(8),
  reason        TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discounts_entity_type_check CHECK (
    entity_type IN ('booking', 'rental', 'accommodation_booking', 'customer_package', 'member_purchase', 'shop_order')
  ),
  CONSTRAINT discounts_unique_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_discounts_customer ON discounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_discounts_entity   ON discounts(entity_type, entity_id);

COMMIT;
