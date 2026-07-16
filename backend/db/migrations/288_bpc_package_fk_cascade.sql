-- booking_package_consumption.customer_package_id had no ON DELETE clause
-- (NO ACTION), so a customer-package hard delete (forceDeleteCustomerPackage)
-- hit a foreign-key violation whenever the package had consumption history —
-- even fully RELEASED rows kept only as audit trail (their booking_id CASCADE
-- never fires because bookings are soft-deleted). Staff saw an opaque 500 and
-- an undeletable package (Arslan Arslan "Kite Beginner 6H", 2026-07-16).
--
-- The ledger rows are meaningless once the package row is gone, so CASCADE is
-- the correct rule. forceDeleteCustomerPackage also deletes them explicitly
-- now; this constraint is the structural backstop for any other delete path.

ALTER TABLE booking_package_consumption
  DROP CONSTRAINT IF EXISTS booking_package_consumption_customer_package_id_fkey;

ALTER TABLE booking_package_consumption
  ADD CONSTRAINT booking_package_consumption_customer_package_id_fkey
  FOREIGN KEY (customer_package_id) REFERENCES customer_packages(id) ON DELETE CASCADE;
