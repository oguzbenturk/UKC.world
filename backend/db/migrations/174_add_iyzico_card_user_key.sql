-- Add iyzico_card_user_key to users table for saved card feature
ALTER TABLE users ADD COLUMN IF NOT EXISTS iyzico_card_user_key TEXT;
