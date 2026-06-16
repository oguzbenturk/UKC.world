import nodemailer from 'nodemailer';
import { logger } from '../middlewares/errorHandler.js';
import { canSendCommunication, CHANNEL, recordMarketingCommunication } from './marketingConsentService.js';
import { recordEmailSend } from './emailDeliveryService.js';

let transporterPromise = null;
const EMAIL_DISABLED = (process.env.EMAIL_TRANSPORT || '').toLowerCase() === 'none';
const DEFAULT_FROM = process.env.EMAIL_FROM || 'UKC. <no-reply@plannivo.com>';
// Replies are routed away from the no-reply sender to a monitored inbox.
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || 'UKC. <info@plannivo.com>';

function buildSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT ?? '', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass) {
    return null;
  }

  const secureFromEnv = (process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureFromEnv === 'true' || secureFromEnv === '1' || port === 465;

  const transportOptions = {
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  };

  // DKIM signing — the single biggest code-level lever for staying out of spam.
  // No-op unless all three env vars are set. The private key can be supplied
  // inline or with literal "\n" sequences (e.g. from a single-line env value).
  const dkimDomain = process.env.DKIM_DOMAIN;
  const dkimSelector = process.env.DKIM_SELECTOR;
  const dkimPrivateKey = process.env.DKIM_PRIVATE_KEY;
  if (dkimDomain && dkimSelector && dkimPrivateKey) {
    transportOptions.dkim = {
      domainName: dkimDomain,
      keySelector: dkimSelector,
      privateKey: dkimPrivateKey.replace(/\\n/g, '\n')
    };
    logger.info('DKIM signing enabled for outbound email', { dkimDomain, dkimSelector });
  } else {
    logger.warn(
      'DKIM signing not configured (DKIM_DOMAIN / DKIM_SELECTOR / DKIM_PRIVATE_KEY) — ' +
      'emails rely on the provider\'s own DKIM, if any. See SPF/DKIM/DMARC DNS setup.'
    );
  }

  return nodemailer.createTransport(transportOptions);
}

function buildStreamTransport() {
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
}

async function resolveTransporter() {
  if (EMAIL_DISABLED) {
    logger.warn('Email transport disabled via EMAIL_TRANSPORT=none');
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = (async () => {
      const smtpTransport = buildSmtpTransport();
      if (smtpTransport) {
        try {
          await smtpTransport.verify();
          logger.info('SMTP transport initialized for email delivery');
          return smtpTransport;
        } catch (error) {
          logger.warn('SMTP transport verification failed, falling back to stream transport', {
            error: error?.message
          });
        }
      }

      const streamTransport = buildStreamTransport();
      logger.info('Stream transport initialized for email previews (no external delivery)');
      return streamTransport;
    })();
  }

  return transporterPromise;
}

/**
 * Send an email with consent checking for marketing communications
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @param {Object} options.headers - Custom headers
 * @param {string} options.from - Override sender (defaults to EMAIL_FROM / no-reply@plannivo.com).
 *                                Use for personable emails (e.g. welcome) that should come from info@plannivo.com.
 * @param {string} options.userId - User ID (required for consent check)
 * @param {string} options.notificationType - Type of notification (e.g., 'booking_confirmation', 'promotion')
 * @param {boolean} options.skipConsentCheck - Skip consent check (use only for transactional emails without userId)
 * @param {string} options.relatedEntityType - Optional tag for the delivery log (e.g. 'warranty_claim')
 * @param {string|number} options.relatedEntityId - Optional id the email relates to (for per-entity delivery status)
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  headers,
  from,
  userId,
  notificationType,
  skipConsentCheck = false,
  relatedEntityType = null,
  relatedEntityId = null
}) {
  if (!to) {
    throw new Error('Email recipient is required');
  }

  if (!subject) {
    throw new Error('Email subject is required');
  }

  // CONSENT CHECK: For marketing emails, verify user has opted in
  if (!skipConsentCheck && userId) {
    const consentResult = await canSendCommunication({
      userId,
      channel: CHANNEL.EMAIL,
      notificationType: notificationType || 'unknown'
    });

    if (!consentResult.allowed) {
      logger.info('Email blocked due to consent', {
        to,
        subject,
        userId,
        notificationType,
        reason: consentResult.reason
      });
      return { 
        skipped: true, 
        reason: consentResult.reason,
        consentBlocked: true
      };
    }
  }

  const transporter = await resolveTransporter();

  if (!transporter) {
    logger.warn('Email send skipped because transporter is disabled', { to, subject });
    return { skipped: true };
  }

  const mailOptions = {
    from: from || DEFAULT_FROM,
    replyTo: DEFAULT_REPLY_TO,
    to,
    subject,
    text,
    html,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      ...(headers || {})
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    if (transporter.options?.streamTransport) {
      const preview = typeof info.message?.toString === 'function' ? info.message.toString() : '';
      logger.info('Email rendered to stream transport (no external delivery)', {
        to,
        subject,
        previewSnippet: preview.slice(0, 160)
      });
      return {
        accepted: Array.isArray(info.accepted) ? info.accepted : [to],
        rejected: info.rejected ?? [],
        messageId: info.messageId ?? null,
        preview
      };
    }

    logger.info('Email dispatched via SMTP', {
      to,
      subject,
      messageId: info.messageId ?? null
    });

    // Record marketing communication for audit
    if (userId && notificationType) {
      await recordMarketingCommunication({
        userId,
        channel: CHANNEL.EMAIL,
        notificationType,
        messageId: info.messageId
      });
    }

    // Delivery log: one row per send, later updated by Resend webhook events.
    // Best-effort (recordEmailSend never throws) — must not affect the send.
    await recordEmailSend({
      recipient: to,
      subject,
      notificationType,
      userId: userId || null,
      relatedEntityType,
      relatedEntityId,
      messageId: info.messageId ?? null,
      status: 'sent'
    });

    return info;
  } catch (error) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: error?.message
    });
    // Record the failed attempt so it's visible in the delivery log too.
    await recordEmailSend({
      recipient: to,
      subject,
      notificationType,
      userId: userId || null,
      relatedEntityType,
      relatedEntityId,
      status: 'failed',
      error: error?.message || 'send failed'
    });
    throw error;
  }
}

export default {
  sendEmail
};
