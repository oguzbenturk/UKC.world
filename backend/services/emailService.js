import nodemailer from 'nodemailer';
import { logger } from '../middlewares/errorHandler.js';
import { canSendCommunication, CHANNEL, recordMarketingCommunication } from './marketingConsentService.js';

let transporterPromise = null;
const EMAIL_DISABLED = (process.env.EMAIL_TRANSPORT || '').toLowerCase() === 'none';
const DEFAULT_FROM = process.env.EMAIL_FROM || 'Plannivo <no-reply@plannivo.com>';

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

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
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
 * @param {string} options.userId - User ID (required for consent check)
 * @param {string} options.notificationType - Type of notification (e.g., 'booking_confirmation', 'promotion')
 * @param {boolean} options.skipConsentCheck - Skip consent check (use only for transactional emails without userId)
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail({ 
  to, 
  subject, 
  text, 
  html, 
  headers,
  userId,
  notificationType,
  skipConsentCheck = false
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
    from: DEFAULT_FROM,
    to,
    subject,
    text,
    html,
    headers
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

    return info;
  } catch (error) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: error?.message
    });
    throw error;
  }
}

export default {
  sendEmail
};
