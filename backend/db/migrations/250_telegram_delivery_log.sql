-- 250_telegram_delivery_log.sql
-- Per-attempt audit trail for outbound Telegram messages. Lets ops answer
-- "did the instructor's phone actually receive that booking?" and surface a
-- delivery history per user. One row per sendToChat attempt — success or fail.

CREATE TABLE IF NOT EXISTS telegram_delivery_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  chat_id         BIGINT NOT NULL,
  type            TEXT,
  idempotency_key TEXT,
  status          TEXT NOT NULL,           -- 'sent' | 'failed' | 'rate-limited' | 'blocked'
  error_code      INTEGER,
  error_reason    TEXT,
  message_id      BIGINT,                  -- Telegram message_id when sent
  attempts        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_delivery_log_user_created
  ON telegram_delivery_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_delivery_log_status_created
  ON telegram_delivery_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_delivery_log_chat_created
  ON telegram_delivery_log (chat_id, created_at DESC);
