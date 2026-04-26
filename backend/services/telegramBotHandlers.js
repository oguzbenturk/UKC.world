import { logger } from '../middlewares/errorHandler.js';
import { pool } from '../db.js';
import {
  consumeLinkCode,
  unlinkChat
} from './telegramService.js';
import {
  buildLinkSuccess,
  buildLinkExpired,
  buildLinkInvalid,
  buildLinkAlreadyUsed,
  buildUnlinkSuccess,
  buildStatusLinked,
  buildStatusUnlinked,
  buildHelp
} from './telegramTemplates/index.js';

const replyHtml = (ctx, text) =>
  ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true });

async function handleLinkAttempt(ctx, code) {
  const chatId = ctx.chat?.id;
  const username = ctx.from?.username || null;
  try {
    const result = await consumeLinkCode({ code, chatId, username });
    switch (result.status) {
      case 'ok':
        await replyHtml(ctx, buildLinkSuccess({ name: result.user?.name }));
        break;
      case 'expired':
        await replyHtml(ctx, buildLinkExpired());
        break;
      case 'consumed':
        await replyHtml(ctx, buildLinkAlreadyUsed());
        break;
      case 'not-found':
      default:
        await replyHtml(ctx, buildLinkInvalid());
        break;
    }
  } catch (error) {
    logger.error('Telegram link attempt failed', { error: error?.message });
    await replyHtml(ctx, '⚠️ Something went wrong. Please try again in a moment.');
  }
}

export function attachTelegramHandlers(bot) {
  bot.command('start', async (ctx) => {
    const code = (ctx.match || '').trim();
    if (!code) {
      await replyHtml(
        ctx,
        [
          '👋 <b>Welcome to Plannivo!</b>',
          '',
          'To finish linking, open Plannivo → Settings → <b>Telegram</b>, click <b>Connect Telegram</b>, copy the code, and send it here as:',
          '<code>/link YOUR_CODE</code>',
          '',
          'Or just paste the code on its own line — I\'ll take it either way.'
        ].join('\n')
      );
      return;
    }
    await handleLinkAttempt(ctx, code);
  });

  // Manual paste fallback when the t.me deep link doesn't carry the payload
  // (common when the user has already started the bot before).
  bot.command('link', async (ctx) => {
    const code = (ctx.match || '').trim();
    if (!code) {
      await replyHtml(ctx, 'Send the code like this:\n<code>/link YOUR_CODE</code>');
      return;
    }
    await handleLinkAttempt(ctx, code);
  });

  // If the user just pastes a bare code (no command prefix), accept it.
  // Codes are 22-char base64url strings — match that shape.
  bot.hears(/^[A-Za-z0-9_-]{20,64}$/, async (ctx) => {
    await handleLinkAttempt(ctx, ctx.match[0]);
  });

  bot.command('unlink', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      await unlinkChat(chatId);
      await replyHtml(ctx, buildUnlinkSuccess());
    } catch (error) {
      logger.warn('Telegram /unlink failed', { chatId, error: error?.message });
      await replyHtml(ctx, '⚠️ Could not unlink right now. Please try again later.');
    }
  });

  bot.command('status', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    try {
      const { rows } = await pool.query(
        `SELECT name FROM users WHERE telegram_chat_id = $1 AND deleted_at IS NULL`,
        [chatId]
      );
      if (rows.length) {
        await replyHtml(ctx, buildStatusLinked({ name: rows[0].name }));
      } else {
        await replyHtml(ctx, buildStatusUnlinked());
      }
    } catch (error) {
      logger.warn('Telegram /status failed', { chatId, error: error?.message });
      await replyHtml(ctx, '⚠️ Status check failed. Please try again later.');
    }
  });

  bot.command('help', async (ctx) => {
    await replyHtml(ctx, buildHelp());
  });

  bot.catch((err) => {
    logger.error('Telegram bot error', {
      error: err?.error?.message || err?.message,
      update: err?.ctx?.update?.update_id
    });
  });
}

export default { attachTelegramHandlers };
