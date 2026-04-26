import crypto from 'crypto';
import { pool } from '../db.js';
import { sendEmail } from './emailService.js';
import { buildVerificationEmail } from './emailTemplates/verificationEmail.js';
import { logger } from '../middlewares/errorHandler.js';

const TOKEN_EXPIRY_HOURS = 24;
const RESEND_COOLDOWN_MINUTES = 2;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ukc.plannivo.com';

const generateToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const buildVerifyUrl = (token, email) =>
  `${FRONTEND_URL.replace(/\/$/, '')}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

async function dispatchVerificationEmail({ userId, email, name }) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await pool.query(
    `UPDATE users
     SET email_verification_token_hash = $1,
         email_verification_token_expires_at = $2,
         email_verification_sent_at = NOW()
     WHERE id = $3`,
    [tokenHash, expiresAt, userId]
  );

  const verificationUrl = buildVerifyUrl(token, email);
  const { subject, html, text } = buildVerificationEmail({
    recipientName: name,
    verificationUrl,
    expiryHours: TOKEN_EXPIRY_HOURS
  });

  await sendEmail({
    to: email,
    subject,
    html,
    text,
    notificationType: 'email_verification',
    skipConsentCheck: true
  });

  logger.info('Verification email sent', { userId, email: email.substring(0, 3) + '***' });
}

export async function sendVerificationEmail(userId, email, name) {
  if (!userId || !email) {
    throw new Error('userId and email are required');
  }
  await dispatchVerificationEmail({ userId, email, name });
}

export async function verifyEmailToken(token, email) {
  if (!token || !email) {
    return { success: false, error: 'Token and email are required.' };
  }

  const tokenHash = hashToken(token);
  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const result = await client.query(
      `SELECT id, email_verified, email_verification_token_expires_at
       FROM users
       WHERE email_verification_token_hash = $1
         AND LOWER(email) = LOWER($2)
         AND deleted_at IS NULL
       FOR UPDATE`,
      [tokenHash, email]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Invalid verification link. Please request a new one.' };
    }

    const row = result.rows[0];

    if (row.email_verified) {
      await client.query(
        `UPDATE users
         SET email_verification_token_hash = NULL,
             email_verification_token_expires_at = NULL
         WHERE id = $1`,
        [row.id]
      );
      await client.query('COMMIT');
      return { success: true, alreadyVerified: true, message: 'Your email is already verified.' };
    }

    if (!row.email_verification_token_expires_at || new Date(row.email_verification_token_expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Verification link has expired. Please request a new one.', expired: true };
    }

    await client.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verified_at = NOW(),
           email_verification_token_hash = NULL,
           email_verification_token_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );

    await client.query('COMMIT');

    logger.info('Email verified', { userId: row.id, email: email.substring(0, 3) + '***' });
    return { success: true, message: 'Your email has been verified. You can now log in.' };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Email verification failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

export async function resendVerification(email) {
  if (!email) {
    return { success: true, message: 'If an account exists with this email, a new verification link has been sent.' };
  }

  const userResult = await pool.query(
    `SELECT id, email, name, first_name, email_verified, email_verification_sent_at
     FROM users
     WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
    [email]
  );

  // Always return the same generic message — don't leak whether the email is registered.
  const genericResponse = {
    success: true,
    message: 'If an account exists with this email, a new verification link has been sent.'
  };

  if (userResult.rows.length === 0) {
    return genericResponse;
  }

  const user = userResult.rows[0];
  if (user.email_verified) {
    return genericResponse;
  }

  if (user.email_verification_sent_at) {
    const lastSent = new Date(user.email_verification_sent_at);
    const cooldownMs = RESEND_COOLDOWN_MINUTES * 60 * 1000;
    if (Date.now() - lastSent.getTime() < cooldownMs) {
      logger.warn('Verification resend rate-limited', { userId: user.id });
      return genericResponse;
    }
  }

  const recipientName = user.first_name || user.name || null;
  await dispatchVerificationEmail({ userId: user.id, email: user.email, name: recipientName });

  return genericResponse;
}

export default {
  sendVerificationEmail,
  verifyEmailToken,
  resendVerification
};
