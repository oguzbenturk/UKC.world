import crypto from 'crypto';
import { Bot } from 'grammy';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const TELEGRAM_DISABLED = !process.env.TELEGRAM_BOT_TOKEN;
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

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
  } else {
    // No webhook URL → fall back to long polling. This is the dev-friendly
    // path: works without a public HTTPS URL or a tunnel. Drop any existing
    // webhook first so getUpdates doesn't 409.
    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (error) {
      logger.warn('deleteWebhook before polling failed (continuing)', { error: error?.message });
    }
    // bot.start() runs forever — fire-and-forget so server boot proceeds.
    bot.start({
      drop_pending_updates: false,
      onStart: (info) => logger.info(`✅ Telegram bot polling started for @${info.username}`)
    }).catch((error) => {
      logger.error('Telegram polling stopped unexpectedly', { error: error?.message });
    });
  }

  _initialized = true;
  return true;
}

export async function sendToChat(chatId, text, options = {}) {
  if (!isTelegramEnabled()) return { sent: false, reason: 'telegram-disabled' };
  if (!chatId) return { sent: false, reason: 'missing-chat-id' };

  try {
    const result = await getBot().api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
    return { sent: true, messageId: result.message_id };
  } catch (error) {
    logger.warn('Telegram sendMessage failed', {
      chatId,
      error: error?.message,
      code: error?.error_code
    });

    if (error?.error_code === 403) {
      try {
        await pool.query(
          `UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL, telegram_linked_at = NULL
           WHERE telegram_chat_id = $1`,
          [chatId]
        );
        logger.info('Cleared telegram_chat_id after 403 from Telegram', { chatId });
      } catch (clearErr) {
        logger.warn('Failed to clear telegram_chat_id after 403', { chatId, error: clearErr.message });
      }
    }

    return { sent: false, reason: error?.message || 'send-failed' };
  }
}

export async function sendToUser(userId, text, options = {}) {
  if (!userId) return { sent: false, reason: 'missing-user-id' };
  if (!isTelegramEnabled()) return { sent: false, reason: 'telegram-disabled' };

  const result = await pool.query(
    `SELECT telegram_chat_id FROM users
     WHERE id = $1 AND deleted_at IS NULL AND telegram_chat_id IS NOT NULL`,
    [userId]
  );
  const chatId = result.rows[0]?.telegram_chat_id;
  if (!chatId) return { sent: false, reason: 'not-linked' };

  return sendToChat(chatId, text, options);
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
 * Look up a link code, mark it consumed, and bind the chat to the user.
 * Returns one of: 'ok' | 'expired' | 'consumed' | 'not-found'
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

    // Detach this chat from any other user (in case they relinked).
    await client.query(
      `UPDATE users
         SET telegram_chat_id = NULL,
             telegram_username = NULL,
             telegram_linked_at = NULL
       WHERE telegram_chat_id = $1 AND id <> $2`,
      [chatId, row.user_id]
    );

    await client.query(
      `UPDATE users
         SET telegram_chat_id = $1,
             telegram_username = $2,
             telegram_linked_at = NOW()
       WHERE id = $3`,
      [chatId, username || null, row.user_id]
    );

    await client.query(
      `UPDATE telegram_link_codes SET consumed_at = NOW() WHERE code = $1`,
      [code]
    );

    const { rows: userRows } = await client.query(
      `SELECT id, name FROM users WHERE id = $1`,
      [row.user_id]
    );

    await client.query('COMMIT');
    return { status: 'ok', user: userRows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('consumeLinkCode failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

export async function unlinkUser(userId) {
  if (!userId) return { unlinked: false };
  const { rowCount } = await pool.query(
    `UPDATE users
       SET telegram_chat_id = NULL,
           telegram_username = NULL,
           telegram_linked_at = NULL
     WHERE id = $1 AND telegram_chat_id IS NOT NULL`,
    [userId]
  );
  return { unlinked: rowCount > 0 };
}

export async function unlinkChat(chatId) {
  if (!chatId) return { unlinked: false };
  const { rowCount } = await pool.query(
    `UPDATE users
       SET telegram_chat_id = NULL,
           telegram_username = NULL,
           telegram_linked_at = NULL
     WHERE telegram_chat_id = $1`,
    [chatId]
  );
  return { unlinked: rowCount > 0 };
}

export async function getStatusForUser(userId) {
  const { rows } = await pool.query(
    `SELECT telegram_username, telegram_linked_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  return {
    linked: !!row?.telegram_linked_at,
    username: row?.telegram_username || null,
    linkedAt: row?.telegram_linked_at || null
  };
}

export default {
  getBot,
  initialize,
  isTelegramEnabled,
  getBotUsername,
  sendToChat,
  sendToUser,
  generateLinkCode,
  consumeLinkCode,
  unlinkUser,
  unlinkChat,
  getStatusForUser
};
