-- Add date_of_birth column to users table and migrate existing age data
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Estimate date_of_birth from existing age values (approximate: subtract age in years from today)
UPDATE users
SET date_of_birth = CURRENT_DATE - (age * INTERVAL '1 year')
WHERE age IS NOT NULL AND date_of_birth IS NULL;
