-- Soft delete the user to allow re-registration
UPDATE users 
SET 
  deleted_at = NOW(),
  original_email = email,
  email = 'deleted_' || id || '_' || EXTRACT(EPOCH FROM NOW())::bigint || '@deleted.plannivo.local',
  account_status = 'deleted'
WHERE email = 'ozibenturk@gmail.com' 
  AND deleted_at IS NULL
RETURNING id, email, original_email, deleted_at;
