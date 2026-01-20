-- Cleanup script for orphaned user data
-- Run this to remove any leftover references after user deletion

BEGIN;

-- 1. Clean up orphaned user_roles (roles pointing to non-existent users)
DELETE FROM user_roles 
WHERE user_id NOT IN (SELECT id FROM users);

-- 2. Clean up orphaned wallet_transactions
DELETE FROM wallet_transactions 
WHERE user_id NOT IN (SELECT id FROM users);

-- 3. Clean up orphaned wallet_balances
DELETE FROM wallet_balances 
WHERE user_id NOT IN (SELECT id FROM users);

-- 4. Clean up orphaned transactions
DELETE FROM transactions 
WHERE user_id NOT IN (SELECT id FROM users);

-- 5. Clean up orphaned notifications
DELETE FROM notifications 
WHERE user_id NOT IN (SELECT id FROM users);

-- 6. Clean up orphaned user_consents
DELETE FROM user_consents 
WHERE user_id NOT IN (SELECT id FROM users);

-- 7. Clean up orphaned instructor_services
DELETE FROM instructor_services 
WHERE instructor_id NOT IN (SELECT id FROM users);

-- 8. Clean up orphaned instructor_service_commissions
DELETE FROM instructor_service_commissions 
WHERE instructor_id NOT IN (SELECT id FROM users);

-- 9. Clean up orphaned financial_events
DELETE FROM financial_events 
WHERE user_id NOT IN (SELECT id FROM users);

-- 10. Clean up orphaned student_accounts
DELETE FROM student_accounts 
WHERE user_id NOT IN (SELECT id FROM users);

-- 11. Clean up orphaned event_registrations
DELETE FROM event_registrations 
WHERE user_id NOT IN (SELECT id FROM users);

-- 12. Clean up orphaned member_purchases
DELETE FROM member_purchases 
WHERE user_id NOT IN (SELECT id FROM users);

-- 13. Clean up orphaned bookings
DELETE FROM bookings 
WHERE customer_user_id NOT IN (SELECT id FROM users)
   OR student_user_id NOT IN (SELECT id FROM users)
   OR instructor_user_id NOT IN (SELECT id FROM users);

-- 14. Clean up orphaned customer_packages
DELETE FROM customer_packages 
WHERE customer_id NOT IN (SELECT id FROM users);

-- 15. Clean up orphaned rentals
DELETE FROM rentals 
WHERE user_id NOT IN (SELECT id FROM users);

-- 16. Clean up orphaned family_members
DELETE FROM family_members 
WHERE parent_user_id NOT IN (SELECT id FROM users);

-- 17. Clean up orphaned liability_waivers
DELETE FROM liability_waivers 
WHERE user_id NOT IN (SELECT id FROM users);

-- 18. Clean up orphaned instructor_earnings
DELETE FROM instructor_earnings 
WHERE instructor_id NOT IN (SELECT id FROM users)
   OR booking_id NOT IN (SELECT id FROM bookings);

-- 19. Clean up orphaned audit_logs
DELETE FROM audit_logs 
WHERE user_id NOT IN (SELECT id FROM users)
   OR target_user_id NOT IN (SELECT id FROM users);

-- Show summary of what was cleaned
SELECT 
  'user_roles' as table_name,
  (SELECT COUNT(*) FROM user_roles WHERE user_id NOT IN (SELECT id FROM users)) as orphaned_count
UNION ALL
SELECT 'wallet_transactions', (SELECT COUNT(*) FROM wallet_transactions WHERE user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'wallet_balances', (SELECT COUNT(*) FROM wallet_balances WHERE user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'transactions', (SELECT COUNT(*) FROM transactions WHERE user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'notifications', (SELECT COUNT(*) FROM notifications WHERE user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'instructor_services', (SELECT COUNT(*) FROM instructor_services WHERE instructor_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'bookings', (SELECT COUNT(*) FROM bookings WHERE customer_user_id NOT IN (SELECT id FROM users) OR student_user_id NOT IN (SELECT id FROM users) OR instructor_user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'customer_packages', (SELECT COUNT(*) FROM customer_packages WHERE customer_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'rentals', (SELECT COUNT(*) FROM rentals WHERE user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'family_members', (SELECT COUNT(*) FROM family_members WHERE parent_user_id NOT IN (SELECT id FROM users))
UNION ALL
SELECT 'liability_waivers', (SELECT COUNT(*) FROM liability_waivers WHERE user_id NOT IN (SELECT id FROM users))
ORDER BY orphaned_count DESC;

COMMIT;
