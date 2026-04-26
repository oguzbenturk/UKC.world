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
    // No webhook URL → fall back to long polling (dev convenience).
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

    // 403 = the user blocked the bot or removed it. Detach this chat so we
    // stop trying to deliver to it.
    if (error?.error_code === 403) {
      try {
        await pool.query(
          `DELETE FROM user_telegram_chats WHERE chat_id = $1`,
          [chatId]
        );
        logger.info('Removed user_telegram_chats row after 403 from Telegram', { chatId });
      } catch (clearErr) {
        logger.warn('Failed to clear chat after 403', { chatId, error: clearErr.message });
      }
    }

    return { sent: false, reason: error?.message || 'send-failed' };
  }
}

/**
 * Send a Telegram message to every chat the given user has linked.
 * Used by the dispatcher; returns aggregate stats per call.
 */
export async function sendToUser(userId, text, options = {}) {
  if (!userId) return { sent: 0, failed: 0, reason: 'missing-user-id' };
  if (!isTelegramEnabled()) return { sent: 0, failed: 0, reason: 'telegram-disabled' };

  const { rows } = await pool.query(
    `SELECT chat_id FROM user_telegram_chats WHERE user_id = $1`,
    [userId]
  );
  if (!rows.length) return { sent: 0, failed: 0, reason: 'not-linked' };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async ({ chat_id }) => {
      const result = await sendToChat(chat_id, text, options);
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
    // chat, just refresh the username/linked_at.
    const upsertResult = await client.query(
      `INSERT INTO user_telegram_chats (user_id, chat_id, username, linked_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, chat_id)
       DO UPDATE SET username = EXCLUDED.username, linked_at = NOW()
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
    `SELECT chat_id, username, linked_at
       FROM user_telegram_chats
      WHERE user_id = $1
      ORDER BY linked_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    chatId: String(r.chat_id),
    username: r.username,
    linkedAt: r.linked_at
  }));
}

export async function getStatusForUser(userId) {
  const chats = await listChatsForUser(userId);
  return {
    linked: chats.length > 0,
    chats,
    botUsername: _botUsername || process.env.TELEGRAM_BOT_USERNAME || null
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
  unlinkChat,
  unlinkAllForUser,
  listChatsForUser,
  getStatusForUser
};
