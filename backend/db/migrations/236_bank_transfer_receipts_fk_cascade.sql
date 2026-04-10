-- Migration 236: Add ON DELETE SET NULL to bank_transfer_receipts FK columns
-- Prevents orphan receipt rows when parent packages/orders are deleted

ALTER TABLE bank_transfer_receipts
  DROP CONSTRAINT IF EXISTS bank_transfer_receipts_customer_package_id_fkey,
  ADD CONSTRAINT bank_transfer_receipts_customer_package_id_fkey
    FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id) ON DELETE SET NULL;

ALTER TABLE bank_transfer_receipts
  DROP CONSTRAINT IF EXISTS bank_transfer_receipts_shop_order_id_fkey,
  ADD CONSTRAINT bank_transfer_receipts_shop_order_id_fkey
    FOREIGN KEY (shop_order_id) REFERENCES shop_orders(id) ON DELETE SET NULL;

ALTER TABLE bank_transfer_receipts
  DROP CONSTRAINT IF EXISTS bank_transfer_receipts_booking_id_fkey,
  ADD CONSTRAINT bank_transfer_receipts_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE bank_transfer_receipts
  DROP CONSTRAINT IF EXISTS bank_transfer_receipts_member_purchase_id_fkey,
  ADD CONSTRAINT bank_transfer_receipts_member_purchase_id_fkey
    FOREIGN KEY (member_purchase_id) REFERENCES member_purchases(id) ON DELETE SET NULL;

ALTER TABLE bank_transfer_receipts
  DROP CONSTRAINT IF EXISTS bank_transfer_receipts_accommodation_booking_id_fkey,
  ADD CONSTRAINT bank_transfer_receipts_accommodation_booking_id_fkey
    FOREIGN KEY (accommodation_booking_id) REFERENCES accommodation_bookings(id) ON DELETE SET NULL;
