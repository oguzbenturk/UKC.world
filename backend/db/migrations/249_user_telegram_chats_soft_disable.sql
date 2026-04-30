-- 249_user_telegram_chats_soft_disable.sql
-- Soft-disable for chats Telegram tells us are unreachable (user blocked the
-- bot, deleted the chat, etc.). Previously we hard-DELETEd the row on a 403,
-- which lost history and made re-linking look like a brand-new connection.
-- With these columns, sendToUser filters active=true and ops can see how many
-- linked chats are currently broken.

ALTER TABLE user_telegram_chats
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_user_telegram_chats_active
  ON user_telegram_chats (user_id) WHERE active = true;
