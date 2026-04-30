/**
 * Password Reset Service
 * 
 * Handles secure password reset flow:
 * 1. Generate cryptographically secure token
 * 2. Store hashed token in database with expiry
 * 3. Send reset email with link
 * 4. Validate token and reset password
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { sendEmail } from './emailService.js';
import { logger } from '../middlewares/errorHandler.js';

// Token expires in 1 hour
const TOKEN_EXPIRY_HOURS = 1;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ukc.plannivo.com';

/**
 * Generate a secure random token
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a password reset token for an existing user and return the reset URL.
 * Use this when you already know the user (e.g. just-registered customers) and want
 * to embed a "set your password" link in another email — the welcome email — without
 * going through the email-enumeration-safe public flow.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.email
 * @param {string} [opts.ipAddress]
 * @param {string} [opts.userAgent]
 * @returns {Promise<{ resetUrl: string, expiresAt: Date, expiryHours: number }>}
 */
export async function issuePasswordResetTokenForUser({ userId, email, ipAddress = null, userAgent = null }) {
  if (!userId || !email) {
    throw new Error('userId and email are required to issue a password reset token');
  }

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await pool.query(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, tokenHash, expiresAt, ipAddress, userAgent]);

  const resetUrl = `${FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

  return { resetUrl, expiresAt, expiryHours: TOKEN_EXPIRY_HOURS };
}

/**
 * Request a password reset for an email
 * @param {string} email - User's email address
 * @param {string} ipAddress - Request IP address
 * @param {string} userAgent - Request user agent
 * @returns {Object} Result with success status
 */
export async function requestPasswordReset(email, ipAddress, userAgent) {
  const client = await pool.connect();
  
  try {
    // Find user by email (case-insensitive, excluding soft-deleted users)
    const userResult = await client.query(
      'SELECT id, email, name, first_name FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email]
    );

    // Always return success to prevent email enumeration attacks
    if (userResult.rows.length === 0) {
      logger.info('Password reset requested for non-existent email', { email: email.substring(0, 3) + '***' });
      return { success: true, message: 'If an account exists with this email, you will receive a password reset link.' };
    }

    const user = userResult.rows[0];

    // Note: anti-abuse is handled by the express-rate-limit middleware
    // (`passwordResetRateLimit`, keyed per IP+email). We deliberately do NOT
    // gate here on "any unused token in the last N minutes" — that previously
    // caused silent failures whenever a token had just been issued by another
    // flow (e.g. the welcome email minting a setup link for a freshly-created
    // customer made admin-triggered forgot-password swallow the email for 5
    // minutes). Always invalidate prior tokens and issue a fresh one.

    // Invalidate any existing unused tokens for this user
    await client.query(`
      UPDATE password_reset_tokens 
      SET used_at = NOW() 
      WHERE user_id = $1 AND used_at IS NULL
    `, [user.id]);

    // Generate new token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store hashed token
    await client.query(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `, [user.id, tokenHash, expiresAt, ipAddress, userAgent]);

    // Build reset URL with plain token (not hashed)
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    // Send email (transactional - skip consent check)
    const userName = user.first_name || user.name || 'User';
    
    const { buildBrandedEmail } = await import('./emailTemplates/brandedLayout.js');
    const branded = buildBrandedEmail({
      preheader: 'Reset your UKC. password',
      eyebrow: 'Account · Security',
      title: 'Reset your password',
      greeting: `Hi ${userName},`,
      bodyParagraphs: [
        'You requested to reset the password on your <strong>UKC.</strong> account.',
        'Click the button below to choose a new password.'
      ],
      ctaLabel: 'Reset password',
      ctaUrl: resetUrl,
      fineprint: [
        `This link expires in ${TOKEN_EXPIRY_HOURS} hour${TOKEN_EXPIRY_HOURS === 1 ? '' : 's'}.`,
        'If you didn\'t request this, you can safely ignore this email — your password will not change.',
        `Request received from IP ${ipAddress}.`
      ]
    });

    await sendEmail({
      to: user.email,
      subject: 'Reset your UKC. password',
      notificationType: 'password_reset',
      skipConsentCheck: true,
      text: `Hi ${userName},

You requested to reset your password for UKC.

Reset your password: ${resetUrl}

This link expires in ${TOKEN_EXPIRY_HOURS} hour(s). If you didn't request this, you can safely ignore this email.

Request IP: ${ipAddress}

— UKC.`,
      html: branded
    });

    logger.info('Password reset email sent', { userId: user.id, email: user.email.substring(0, 3) + '***' });

    return { 
      success: true, 
      message: 'If an account exists with this email, you will receive a password reset link.' 
    };

  } catch (error) {
    logger.error('Password reset request failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate a password reset token
 * @param {string} token - The plain token from the URL
 * @param {string} email - User's email for additional validation
 * @returns {Object} Validation result
 */
export async function validateResetToken(token, email) {
  const tokenHash = hashToken(token);

  const result = await pool.query(`
    SELECT prt.*, u.email, u.id as user_id
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = $1 
      AND LOWER(u.email) = LOWER($2)
      AND prt.used_at IS NULL
      AND prt.expires_at > NOW()
  `, [tokenHash, email]);

  if (result.rows.length === 0) {
    return { valid: false, error: 'Invalid or expired reset link. Please request a new one.' };
  }

  return { valid: true, userId: result.rows[0].user_id };
}

/**
 * Reset password using a valid token
 * @param {string} token - The plain token from the URL
 * @param {string} email - User's email
 * @param {string} newPassword - New password to set
 * @param {string} ipAddress - Request IP address
 * @returns {Object} Result
 */
export async function resetPassword(token, email, newPassword, ipAddress) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Validate token
    const tokenHash = hashToken(token);
    
    const tokenResult = await client.query(`
      SELECT prt.id, prt.user_id, u.email
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1 
        AND LOWER(u.email) = LOWER($2)
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
      FOR UPDATE
    `, [tokenHash, email]);

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Invalid or expired reset link. Please request a new one.' };
    }

    const { id: tokenId, user_id: userId } = tokenResult.rows[0];

    // Validate password strength
    if (!newPassword || newPassword.length < 8) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await client.query(`
      UPDATE users 
      SET password_hash = $1, 
          updated_at = NOW(),
          failed_login_attempts = 0,
          account_locked = false,
          account_locked_at = NULL
      WHERE id = $2
    `, [hashedPassword, userId]);

    // Mark token as used
    await client.query(`
      UPDATE password_reset_tokens 
      SET used_at = NOW() 
      WHERE id = $1
    `, [tokenId]);

    // Invalidate all other tokens for this user
    await client.query(`
      UPDATE password_reset_tokens 
      SET used_at = NOW() 
      WHERE user_id = $1 AND id != $2 AND used_at IS NULL
    `, [userId, tokenId]);

    await client.query('COMMIT');

    logger.info('Password reset successful', { userId, ip: ipAddress });

    // Send confirmation email (transactional - security notification)
    const userResult = await pool.query('SELECT email, name, first_name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const userName = user.first_name || user.name || 'User';

      const { buildBrandedEmail } = await import('./emailTemplates/brandedLayout.js');
      const branded = buildBrandedEmail({
        preheader: 'Your UKC. password was just changed',
        eyebrow: 'Account · Security',
        title: 'Password updated',
        greeting: `Hi ${userName},`,
        bodyParagraphs: [
          'Your password has been successfully reset.',
          'If this wasn\'t you, please contact our team immediately so we can secure the account.'
        ],
        fineprint: [
          `Time: ${new Date().toUTCString()}`,
          `Request IP: ${ipAddress}`
        ]
      });

      await sendEmail({
        to: user.email,
        subject: 'Your UKC. password has been changed',
        notificationType: 'password_changed',
        skipConsentCheck: true,
        text: `Hi ${userName},

Your UKC. password has been successfully reset.

If you did not make this change, please contact our team immediately.

Time: ${new Date().toISOString()}
Request IP: ${ipAddress}

— UKC.`,
        html: branded
      });
    }

    return { success: true, message: 'Password has been reset successfully. You can now log in with your new password.' };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Password reset failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

export default {
  issuePasswordResetTokenForUser,
  requestPasswordReset,
  validateResetToken,
  resetPassword
};
