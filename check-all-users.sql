-- Find all users that might need to be soft-deleted
-- (users with certain patterns that indicate they should be removed)
SELECT id, email, first_name, last_name, account_status, deleted_at, created_at
FROM users
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;
