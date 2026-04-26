-- 244_add_telegram_integration.sql
-- Adds Telegram bot integration: per-user chat ID storage, one-time link codes,
-- and a notification_settings toggle so users can disable Telegram delivery.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id
  ON users (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code         VARCHAR(64) PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user
  ON telegram_link_codes (user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_pending
  ON telegram_link_codes (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS telegram_notifications BOOLEAN NOT NULL DEFAULT true;
