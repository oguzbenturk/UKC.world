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
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://plannivo.com';

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

    // Check for recent reset requests (prevent spam)
    const recentRequest = await client.query(`
      SELECT id FROM password_reset_tokens 
      WHERE user_id = $1 
        AND created_at > NOW() - INTERVAL '5 minutes'
        AND used_at IS NULL
    `, [user.id]);

    if (recentRequest.rows.length > 0) {
      logger.warn('Password reset rate limited - recent request exists', { userId: user.id });
      return { success: true, message: 'If an account exists with this email, you will receive a password reset link.' };
    }

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
    
    await sendEmail({
      to: user.email,
      subject: 'Reset Your Plannivo Password',
      notificationType: 'password_reset', // Transactional type
      skipConsentCheck: true, // Password reset is transactional, always allowed
      text: `
Hi ${userName},

You requested to reset your password for your Plannivo account.

Click the link below to reset your password:
${resetUrl}

This link will expire in ${TOKEN_EXPIRY_HOURS} hour(s).

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

For security, this request was received from IP: ${ipAddress}

Best regards,
The Plannivo Team
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">Password Reset Request</h1>
  </div>
  
  <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
    <p style="margin-top: 0;">Hi <strong>${userName}</strong>,</p>
    <p>You requested to reset your password for your Plannivo account.</p>
    <p>Click the button below to reset your password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #0ea5e9; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Reset Password
      </a>
    </div>
    
    <p style="color: #64748b; font-size: 14px;">This link will expire in <strong>${TOKEN_EXPIRY_HOURS} hour(s)</strong>.</p>
    <p style="color: #64748b; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email.</p>
  </div>
  
  <div style="text-align: center; color: #94a3b8; font-size: 12px;">
    <p>For security, this request was received from IP: ${ipAddress}</p>
    <p style="margin-bottom: 0;">&copy; ${new Date().getFullYear()} Plannivo. All rights reserved.</p>
  </div>
</body>
</html>
      `.trim()
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
    await client.query('BEGIN');

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

      await sendEmail({
        to: user.email,
        subject: 'Your Plannivo Password Has Been Reset',
        notificationType: 'password_changed', // Transactional type
        skipConsentCheck: true, // Security notifications always sent
        text: `
Hi ${userName},

Your password has been successfully reset.

If you did not make this change, please contact our support team immediately.

Request details:
- Time: ${new Date().toISOString()}
- IP Address: ${ipAddress}

Best regards,
The Plannivo Team
        `.trim(),
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">Password Changed</h1>
  </div>
  
  <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
    <p style="margin-top: 0;">Hi <strong>${userName}</strong>,</p>
    <p style="color: #166534;">✓ Your password has been successfully reset.</p>
    <p>If you did not make this change, please contact our support team immediately.</p>
    <p style="color: #64748b; font-size: 14px; margin-bottom: 0;">
      Request IP: ${ipAddress}<br>
      Time: ${new Date().toLocaleString()}
    </p>
  </div>
  
  <div style="text-align: center; color: #94a3b8; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} Plannivo. All rights reserved.</p>
  </div>
</body>
</html>
        `.trim()
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
  requestPasswordReset,
  validateResetToken,
  resetPassword
};
