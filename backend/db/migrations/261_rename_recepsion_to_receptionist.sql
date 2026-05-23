-- Rename the "Recepsion" role to "receptionist" (fix typo) and adjust permissions:
--   - add finances:read so receptionists can view customer financial data
--   - remove bookings:delete and equipment:delete so receptionists cannot delete records
-- Safe to run on databases where the role has already been renamed (no-op).
UPDATE roles
SET name = 'receptionist',
    permissions = (permissions - 'bookings:delete' - 'equipment:delete')
                  || '{"finances:read": true}'::jsonb
WHERE name = 'Recepsion';
