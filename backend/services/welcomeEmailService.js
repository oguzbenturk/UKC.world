import { logger } from '../middlewares/errorHandler.js';
import { sendEmail } from './emailService.js';
import { buildWelcomeEmail } from './emailTemplates/welcomeEmail.js';
import { issuePasswordResetTokenForUser } from './passwordResetService.js';

const WELCOME_FROM = 'Duotone Pro Center Urla <info@plannivo.com>';

async function deliverWelcomeEmail({ user, ipAddress, userAgent }) {
  let passwordResetUrl = null;
  let resetExpiryHours;

  try {
    const issued = await issuePasswordResetTokenForUser({
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent
    });
    passwordResetUrl = issued.resetUrl;
    resetExpiryHours = issued.expiryHours;
  } catch (tokenErr) {
    logger.warn('Failed to issue password reset token for welcome email; falling back to login link', {
      userId: user.id,
      error: tokenErr.message
    });
  }

  const welcome = buildWelcomeEmail({
    recipientName: user.first_name || user.name,
    passwordResetUrl,
    resetExpiryHours
  });

  await sendEmail({
    to: user.email,
    from: WELCOME_FROM,
    subject: welcome.subject,
    html: welcome.html,
    text: welcome.text,
    notificationType: 'welcome',
    skipConsentCheck: true
  });
}

export function sendWelcomeEmailWithResetLink({ user, req, context = 'welcome email' }) {
  const ipAddress = req?.ip ?? null;
  const userAgent = req?.get?.('User-Agent') ?? null;

  deliverWelcomeEmail({ user, ipAddress, userAgent }).catch((err) => {
    logger.error(`Failed to send ${context}`, {
      userId: user?.id,
      error: err.message
    });
  });
}
