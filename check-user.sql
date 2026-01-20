-- Check if soft delete columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('deleted_at', 'deleted_by', 'original_email');

-- Check the specific user
SELECT id, email, deleted_at 
FROM users 
WHERE email = 'ozibenturk@gmail.com';

-- Check indexes on email
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'users' 
  AND indexdef LIKE '%email%';
