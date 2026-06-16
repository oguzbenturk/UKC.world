import express from 'express';
import crypto from 'crypto';
import { logger } from '../middlewares/errorHandler.js';
import { applyEmailEvent } from '../services/emailDeliveryService.js';

// Resend delivery webhook. Resend POSTs an event (email.delivered, .bounced,
// .complained, .opened, …) for every message; we update the matching row in
// email_deliveries so staff can see real delivery status in-app.
//
// Mounted under the CSRF-exempt /api/webhooks/ prefix. The raw request body is
// captured globally by express.json's verify callback (server.js) → req.rawBody,
// which we need for the Svix signature check (parsing reorders/normalizes JSON).

const router = express.Router();

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

// Resend signs webhooks with the Svix scheme: base64( HMAC-SHA256( key,
// `${id}.${timestamp}.${rawBody}` ) ), key = base64-decoded secret after the
// "whsec_" prefix. The svix-signature header is a space-separated list of
// "v1,<sig>" — any match passes.
function verifySvixSignature(rawBody, headers) {
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Replay protection: reject timestamps more than 5 minutes from now.
  const ts = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const rawSecret = WEBHOOK_SECRET.startsWith('whsec_')
    ? WEBHOOK_SECRET.slice('whsec_'.length)
    : WEBHOOK_SECRET;
  let keyBytes;
  try {
    keyBytes = Buffer.from(rawSecret, 'base64');
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');

  const provided = String(svixSignature)
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean);

  return provided.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

router.post('/', async (req, res) => {
  if (WEBHOOK_SECRET) {
    if (!verifySvixSignature(req.rawBody || '', req.headers)) {
      logger.warn('Resend webhook: signature verification failed');
      return res.status(401).json({ error: 'invalid signature' });
    }
  } else {
    // Initial-rollout grace: accept but warn so the operator configures the secret.
    logger.warn('Resend webhook: RESEND_WEBHOOK_SECRET not set — accepting event UNVERIFIED');
  }

  // Parse from the RAW body, not req.body — the global sanitizeInput middleware
  // can mutate string fields (e.g. the subject we match on). rawBody is exactly
  // what Resend signed and sent.
  let event = {};
  try {
    event = req.rawBody ? JSON.parse(req.rawBody) : (req.body || {});
  } catch {
    event = req.body || {};
  }
  const type = event.type;
  const data = event.data || {};

  if (!type || !type.startsWith('email.')) {
    return res.status(200).json({ ignored: true });
  }

  const providerId = data.email_id || null;
  const subject = data.subject || null;
  const occurredAt = event.created_at || data.created_at || null;
  const recipients = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);

  let errorText = null;
  if (type === 'email.bounced') {
    errorText = data.bounce?.message || data.bounce?.subType || data.bounce?.type || 'bounced';
  } else if (type === 'email.complained') {
    errorText = 'marked as spam';
  }

  try {
    let matched = 0;
    for (const recipient of recipients) {
      const result = await applyEmailEvent({
        eventType: type, providerId, recipient, subject, occurredAt, errorText
      });
      if (result.matched) matched += 1;
    }
    logger.info('Resend webhook processed', {
      type, providerId, recipients: recipients.length, matched
    });
    return res.status(200).json({ ok: true, matched });
  } catch (err) {
    logger.error('Resend webhook: processing failed', { type, error: err.message });
    // Non-2xx → Resend retries with backoff.
    return res.status(500).json({ error: 'processing failed' });
  }
});

export default router;
