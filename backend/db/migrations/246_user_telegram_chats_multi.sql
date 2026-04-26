-- 246_user_telegram_chats_multi.sql
-- Replace the single-chat-per-user model on users.telegram_chat_id with a
-- proper one-to-many table so a single Plannivo account can be linked to
-- multiple Telegram chats (personal phone + work phone, you + assistant, etc).

CREATE TABLE IF NOT EXISTS user_telegram_chats (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id     BIGINT NOT NULL,
  username    VARCHAR(64),
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

-- A Telegram chat can only be linked to one Plannivo account at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_telegram_chats_chat
  ON user_telegram_chats (chat_id);

CREATE INDEX IF NOT EXISTS idx_user_telegram_chats_user
  ON user_telegram_chats (user_id);

-- Carry over existing single-chat links from users.* into the new table.
-- Done conditionally — if migration 244 columns are already gone (dev DB
-- recreated etc.) this block is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'telegram_chat_id'
  ) THEN
    INSERT INTO user_telegram_chats (user_id, chat_id, username, linked_at)
    SELECT id, telegram_chat_id, telegram_username, COALESCE(telegram_linked_at, NOW())
    FROM users
    WHERE telegram_chat_id IS NOT NULL
      AND deleted_at IS NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Drop the old single-chat columns and their unique index (if present).
DROP INDEX IF EXISTS idx_users_telegram_chat_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS telegram_chat_id,
  DROP COLUMN IF EXISTS telegram_username,
  DROP COLUMN IF EXISTS telegram_linked_at;
