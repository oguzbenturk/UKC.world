import express from 'express';
import { webhookCallback } from 'grammy';
import { authenticateJWT } from './auth.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  getBot,
  isTelegramEnabled,
  generateLinkCode,
  unlinkChat,
  unlinkAllForUser,
  getStatusForUser,
  sendTestMessage
} from '../services/telegramService.js';

const router = express.Router();

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

router.post('/webhook', (req, res, next) => {
  if (!isTelegramEnabled()) {
    return res.status(503).json({ error: 'Telegram bot disabled' });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // In production a missing secret means anyone can POST forged Telegram
  // updates to us — refuse to serve the endpoint until ops configures it.
  if (!expectedSecret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Telegram webhook rejected: TELEGRAM_WEBHOOK_SECRET is required in production');
      return res.status(503).json({ error: 'Telegram webhook is not configured securely' });
    }
    logger.warn('Telegram webhook running without secret token (dev only)');
  } else {
    const provided = req.get(SECRET_HEADER);
    if (provided !== expectedSecret) {
      logger.warn('Telegram webhook rejected: bad secret token', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const handler = webhookCallback(getBot(), 'express');
  return handler(req, res, next);
});

router.use(authenticateJWT);

router.get('/status', async (req, res) => {
  try {
    const status = await getStatusForUser(req.user.id);
    res.json(status);
  } catch (error) {
    logger.error('Telegram status fetch failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: 'Failed to load Telegram status' });
  }
});

router.post('/link-code', async (req, res) => {
  if (!isTelegramEnabled()) {
    return res.status(503).json({ error: 'Telegram bot is not configured' });
  }
  try {
    const { code, expiresAt, deepLinkUrl } = await generateLinkCode(req.user.id);
    res.json({ code, expiresAt, deepLinkUrl });
  } catch (error) {
    logger.error('Telegram link-code generation failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: 'Failed to generate link code' });
  }
});

// Remove a single linked chat (per-device unlink button in the UI).
router.delete('/chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const result = await unlinkChat({ chatId, userId: req.user.id });
    res.json(result);
  } catch (error) {
    logger.error('Telegram chat unlink failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: 'Failed to unlink chat' });
  }
});

// Remove all linked chats for the current user.
router.post('/unlink', async (req, res) => {
  try {
    const result = await unlinkAllForUser(req.user.id);
    res.json(result);
  } catch (error) {
    logger.error('Telegram unlink-all failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: 'Failed to unlink Telegram' });
  }
});

// Send a one-off test message to every active chat for the current user.
// Used by the "Send test message" button in Settings → Telegram so users can
// verify their connection without waiting for a real booking event.
router.post('/test', async (req, res) => {
  if (!isTelegramEnabled()) {
    return res.status(503).json({ error: 'Telegram bot is not configured' });
  }
  try {
    const result = await sendTestMessage(req.user.id);
    if (result.sent > 0) {
      return res.json({ ok: true, sent: result.sent, failed: result.failed });
    }
    return res.status(400).json({
      ok: false,
      sent: 0,
      failed: result.failed || 0,
      reason: result.reason || 'no-active-chats'
    });
  } catch (error) {
    logger.error('Telegram test message failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

export default router;
