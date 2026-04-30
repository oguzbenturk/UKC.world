import crypto from 'crypto';
import { Bot } from 'grammy';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const TELEGRAM_DISABLED = !process.env.TELEGRAM_BOT_TOKEN;

// Link-code TTL is configurable so we can shorten it in production (5 min is
// the industry standard for sensitive single-use tokens) without redeploying.
const LINK_CODE_TTL_MS = (() => {
  const raw = Number(process.env.TELEGRAM_LINK_CODE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 60_000 && raw <= 60 * 60_000) return raw;
  return 5 * 60 * 1000;
})();

// Telegram quotas: 30 msg/sec global, 1 msg/sec per chat. On 429 the API tells
// us how long to wait via parameters.retry_after. We honour it once (capped)
// and otherwise back off exponentially for transient 5xx.
const RATE_LIMIT_MAX_WAIT_MS = 60_000;
const TRANSIENT_RETRY_DELAYS_MS = [250, 1000, 4000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _bot = null;
let _initialized = false;
let _botUsername = process.env.TELEGRAM_BOT_USERNAME || null;

export function getBot() {
  if (TELEGRAM_DISABLED) return null;
  if (!_bot) {
    _bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  }
  return _bot;
}

export function isTelegramEnabled() {
  return !TELEGRAM_DISABLED && _initialized;
}

export function getBotUsername() {
  return _botUsername;
}

/**
 * Verify the bot token, register webhook (if configured), and attach handlers.
 * Safe to call once at server boot. Never throws — failures degrade to no-ops.
 */
export async function initialize({ webhookUrl, webhookSecret, attachHandlers } = {}) {
  if (TELEGRAM_DISABLED) {
    logger.warn('Telegram bot disabled: TELEGRAM_BOT_TOKEN not set');
    return false;
  }

  const bot = getBot();

  try {
    const me = await bot.api.getMe();
    _botUsername = me.username || _botUsername;
    logger.info(`✅ Telegram bot authenticated as @${me.username} (id=${me.id})`);
  } catch (error) {
    logger.warn('⚠️ Telegram bot getMe() failed; bot disabled', { error: error?.message });
    return false;
  }

  if (typeof attachHandlers === 'function') {
    try {
      attachHandlers(bot);
    } catch (error) {
      logger.warn('Telegram attachHandlers failed', { error: error?.message });
    }
  }

  if (webhookUrl) {
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: webhookSecret || undefined,
        allowed_updates: ['message', 'callback_query']
      });
      logger.info(`✅ Telegram webhook registered at ${webhookUrl}`);
    } catch (error) {
      logger.warn('Failed to register Telegram webhook', { webhookUrl, error: error?.message });
    }
  } else if (process.env.TELEGRAM_DEV_POLLING === 'true') {
    // Opt-in long polling for local dev testing. Off by default because
    // starting polling on a token that has a webhook registered (prod) will
    // call deleteWebhook and steal updates from production. Enable explicitly
    // with TELEGRAM_DEV_POLLING=true only when prod isn't using the same bot.
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (error) {
      logger.warn('deleteWebhook before polling failed (continuing)', { error: error?.message });
    }
    bot.start({
      drop_pending_updates: false,
      onStart: (info) => logger.info(`✅ Telegram bot polling started for @${info.username}`)
    }).catch((error) => {
      logger.error('Telegram polling stopped unexpectedly', { error: error?.message });
    });
  } else {
    logger.info(
      'Telegram bot is authenticated but inbound updates are disabled in this env ' +
      '(no TELEGRAM_WEBHOOK_URL and TELEGRAM_DEV_POLLING != true). Outbound sendMessage still works.'
    );
  }

  _initialized = true;
  return true;
}

// Internal: write one row to the delivery audit log. Best-effort — we never
// want a logging failure to mask the actual send result, so all errors here
// are swallowed with a warn.
async function recordDelivery({ userId, chatId, type, idempotencyKey, status, errorCode, errorReason, messageId, attempts }) {
  try {
    await pool.query(
      `INSERT INTO telegram_delivery_log
         (user_id, chat_id, type, idempotency_key, status, error_code, error_reason, message_id, attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId || null,
        chatId,
        type || null,
        idempotencyKey || null,
        status,
        errorCode || null,
        errorReason || null,
        messageId || null,
        attempts || 1
      ]
    );
  } catch (err) {
    logger.warn('telegram_delivery_log insert failed', { chatId, error: err.message });
  }
}

// Internal: handle a 403/400 "chat unreachable" by soft-disabling the row
// rather than deleting it. Preserves history so ops can see broken links.
async function softDisableChat(chatId, reason) {
  try {
    await pool.query(
      `UPDATE user_telegram_chats
          SET active = false,
              last_error_at = NOW(),
              last_error_reason = $2
        WHERE chat_id = $1`,
      [chatId, reason || null]
    );
    logger.info('Soft-disabled user_telegram_chats row after permanent failure', { chatId, reason });
  } catch (clearErr) {
    logger.warn('Failed to soft-disable chat', { chatId, error: clearErr.message });
  }
}

const isPermanentFailure = (errorCode, message) => {
  if (errorCode === 403) return true;
  if (errorCode === 400 && /chat not found|user is deactivated|bot was kicked/i.test(String(message || ''))) return true;
  return false;
};

const isRateLimit = (errorCode) => errorCode === 429;
const isTransient = (errorCode) => Number.isInteger(errorCode) && errorCode >= 500 && errorCode < 600;

/**
 * Low-level send to a single chat with retry handling for 429/5xx and
 * soft-disable on permanent failures. Always records a delivery_log row.
 *
 * Caller can pass { userId, type, idempotencyKey } so the audit log knows
 * which Plannivo notification this attempt belonged to.
 */
export async function sendToChat(chatId, text, options = {}) {
  const { userId, type, idempotencyKey, ...telegramOpts } = options || {};

  if (!isTelegramEnabled()) {
    return { sent: false, reason: 'telegram-disabled' };
  }
  if (!chatId) return { sent: false, reason: 'missing-chat-id' };

  let attempts = 0;
  let lastErrorCode = null;
  let lastErrorMessage = null;

  for (;;) {
    attempts += 1;
    try {
      const result = await getBot().api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...telegramOpts
      });
      await recordDelivery({
        userId, chatId, type, idempotencyKey,
        status: 'sent',
        messageId: result.message_id,
        attempts
      });
      return { sent: true, messageId: result.message_id, attempts };
    } catch (error) {
      lastErrorCode = error?.error_code ?? null;
      lastErrorMessage = error?.message || 'send-failed';

      // Rate-limited: honour Telegram's retry_after hint, retry once.
      if (isRateLimit(lastErrorCode) && attempts === 1) {
        const retryAfterSec = Number(error?.parameters?.retry_after) || 1;
        const waitMs = Math.min(retryAfterSec * 1000, RATE_LIMIT_MAX_WAIT_MS);
        logger.info('Telegram 429 — backing off', { chatId, waitMs });
        await sleep(waitMs);
        continue;
      }

      // Transient server error: exponential backoff up to 3 retries.
      if (isTransient(lastErrorCode) && attempts <= TRANSIENT_RETRY_DELAYS_MS.length) {
        const waitMs = TRANSIENT_RETRY_DELAYS_MS[attempts - 1];
        logger.info('Telegram 5xx — retrying', { chatId, code: lastErrorCode, waitMs });
        await sleep(waitMs);
        continue;
      }

      logger.warn('Telegram sendMessage failed', {
        chatId,
        error: lastErrorMessage,
        code: lastErrorCode,
        attempts
      });

      const permanent = isPermanentFailure(lastErrorCode, lastErrorMessage);
      if (permanent) {
        await softDisableChat(chatId, lastErrorMessage);
      }

      const status = isRateLimit(lastErrorCode)
        ? 'rate-limited'
        : permanent ? 'blocked' : 'failed';

      await recordDelivery({
        userId, chatId, type, idempotencyKey,
        status,
        errorCode: lastErrorCode,
        errorReason: lastErrorMessage,
        attempts
      });

      return {
        sent: false,
        reason: lastErrorMessage,
        errorCode: lastErrorCode,
        attempts,
        permanent
      };
    }
  }
}

/**
 * Send a Telegram message to every active chat the given user has linked.
 * Used by the dispatcher; returns aggregate stats per call.
 *
 * Pass { type, idempotencyKey } so each underlying sendToChat call records
 * the Plannivo notification context in telegram_delivery_log.
 */
export async function sendToUser(userId, text, options = {}) {
  if (!userId) return { sent: 0, failed: 0, reason: 'missing-user-id' };
  if (!isTelegramEnabled()) return { sent: 0, failed: 0, reason: 'telegram-disabled' };

  const { rows } = await pool.query(
    `SELECT chat_id
       FROM user_telegram_chats
      WHERE user_id = $1 AND active = true`,
    [userId]
  );
  if (!rows.length) return { sent: 0, failed: 0, reason: 'not-linked' };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async ({ chat_id }) => {
      const result = await sendToChat(chat_id, text, { ...options, userId });
      if (result.sent) sent++;
      else failed++;
    })
  );
  return { sent, failed };
}

export async function generateLinkCode(userId) {
  if (!userId) throw new Error('userId is required');

  const code = crypto.randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await pool.query(
    `INSERT INTO telegram_link_codes (code, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [code, userId, expiresAt]
  );

  const username = _botUsername || process.env.TELEGRAM_BOT_USERNAME || '';
  const deepLinkUrl = username
    ? `https://t.me/${username.replace(/^@/, '')}?start=${code}`
    : null;

  return { code, expiresAt: expiresAt.toISOString(), deepLinkUrl };
}

/**
 * Look up a link code, mark it consumed, and add the chat to the user.
 * If the chat is already linked to the SAME user, this is a no-op success.
 * If the chat is currently linked to a DIFFERENT user, that link is moved.
 * Returns: 'ok' | 'already-linked' | 'expired' | 'consumed' | 'not-found'
 */
export async function consumeLinkCode({ code, chatId, username }) {
  if (!code || !chatId) return { status: 'not-found' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT user_id, expires_at, consumed_at
       FROM telegram_link_codes
       WHERE code = $1
       FOR UPDATE`,
      [code]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return { status: 'not-found' };
    }

    const row = rows[0];
    if (row.consumed_at) {
      await client.query('ROLLBACK');
      return { status: 'consumed' };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return { status: 'expired' };
    }

    // Detach this chat from any other user (chat_id is globally unique).
    await client.query(
      `DELETE FROM user_telegram_chats WHERE chat_id = $1 AND user_id <> $2`,
      [chatId, row.user_id]
    );

    // Upsert the link for the target user — if they already linked this same
    // chat, refresh the username/linked_at and re-activate it (a previous 403
    // may have soft-disabled the row).
    const upsertResult = await client.query(
      `INSERT INTO user_telegram_chats (user_id, chat_id, username, linked_at, active, last_error_at, last_error_reason)
       VALUES ($1, $2, $3, NOW(), true, NULL, NULL)
       ON CONFLICT (user_id, chat_id)
       DO UPDATE SET username = EXCLUDED.username,
                     linked_at = NOW(),
                     active = true,
                     last_error_at = NULL,
                     last_error_reason = NULL
       RETURNING (xmax = 0) AS inserted`,
      [row.user_id, chatId, username || null]
    );
    const wasNewLink = upsertResult.rows[0]?.inserted === true;

    await client.query(
      `UPDATE telegram_link_codes SET consumed_at = NOW() WHERE code = $1`,
      [code]
    );

    const { rows: userRows } = await client.query(
      `SELECT id, name FROM users WHERE id = $1`,
      [row.user_id]
    );

    await client.query('COMMIT');
    return {
      status: wasNewLink ? 'ok' : 'already-linked',
      user: userRows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('consumeLinkCode failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Unlink a single chat. If userId is supplied the row must belong to that user
 * (used by the authenticated REST endpoint); without userId it's used by the
 * /unlink bot command which keys off the chat alone.
 */
export async function unlinkChat({ chatId, userId } = {}) {
  if (!chatId) return { unlinked: false };
  const params = [chatId];
  let sql = `DELETE FROM user_telegram_chats WHERE chat_id = $1`;
  if (userId) {
    sql += ` AND user_id = $2`;
    params.push(userId);
  }
  const { rowCount } = await pool.query(sql, params);
  return { unlinked: rowCount > 0 };
}

/**
 * Remove every linked chat for a user. Used by the "Unlink all" path.
 */
export async function unlinkAllForUser(userId) {
  if (!userId) return { unlinked: 0 };
  const { rowCount } = await pool.query(
    `DELETE FROM user_telegram_chats WHERE user_id = $1`,
    [userId]
  );
  return { unlinked: rowCount };
}

/**
 * List every chat linked to the given user. The frontend renders one row per
 * entry so users can see and remove individual devices.
 */
export async function listChatsForUser(userId) {
  if (!userId) return [];
  const { rows } = await pool.query(
    `SELECT chat_id, username, linked_at, active, last_error_at, last_error_reason
       FROM user_telegram_chats
      WHERE user_id = $1
      ORDER BY linked_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    chatId: String(r.chat_id),
    username: r.username,
    linkedAt: r.linked_at,
    active: r.active,
    lastErrorAt: r.last_error_at,
    lastErrorReason: r.last_error_reason
  }));
}

export async function getStatusForUser(userId) {
  const chats = await listChatsForUser(userId);
  const activeChats = chats.filter((c) => c.active !== false);
  return {
    linked: activeChats.length > 0,
    hasInactiveChats: chats.some((c) => c.active === false),
    chats,
    botUsername: _botUsername || process.env.TELEGRAM_BOT_USERNAME || null
  };
}

/**
 * Send a "your Telegram is wired up" smoke test to the requesting user. Used
 * by the Settings → Telegram "Send test message" button. Returns the same
 * shape as sendToUser plus a friendly reason on the no-op cases.
 */
export async function sendTestMessage(userId) {
  if (!userId) return { sent: 0, failed: 0, reason: 'missing-user-id' };
  if (!isTelegramEnabled()) return { sent: 0, failed: 0, reason: 'telegram-disabled' };

  const text = [
    '✅ <b>Plannivo test message</b>',
    '',
    'If you can read this, your Telegram link is working.',
    'You will receive booking and lesson notifications here.'
  ].join('\n');

  return sendToUser(userId, text, { type: 'telegram_test' });
}

/**
 * Periodic housekeeping: drop link codes that have been consumed for >30 days
 * or that expired >7 days ago. Keeps the telegram_link_codes table from
 * growing forever. Wired into a cron in server.js.
 */
export async function pruneStaleLinkCodes() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM telegram_link_codes
        WHERE (consumed_at IS NOT NULL AND consumed_at < NOW() - INTERVAL '30 days')
           OR (consumed_at IS NULL AND expires_at < NOW() - INTERVAL '7 days')`
    );
    if (rowCount > 0) {
      logger.info('Pruned stale telegram_link_codes', { rowCount });
    }
    return { pruned: rowCount };
  } catch (error) {
    logger.warn('pruneStaleLinkCodes failed', { error: error.message });
    return { pruned: 0, error: error.message };
  }
}

export default {
  getBot,
  initialize,
  isTelegramEnabled,
  getBotUsername,
  sendToChat,
  sendToUser,
  sendTestMessage,
  generateLinkCode,
  consumeLinkCode,
  unlinkChat,
  unlinkAllForUser,
  listChatsForUser,
  getStatusForUser,
  pruneStaleLinkCodes
};
