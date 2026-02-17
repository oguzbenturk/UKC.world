import express from 'express';
import { pool } from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import twoFactorService from '../services/twoFactorService.js';
import permissionService from '../services/permissionService.js';
import { authenticateJWT } from './auth.js';
import { authRateLimit } from '../middlewares/security.js';

const router = express.Router();

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';

/**
 * Setup 2FA - Generate secret and QR code
 */
router.post('/setup-2fa', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Check if user already has 2FA enabled
    const existing = await twoFactorService.getUserTwoFactor(userId);
    if (existing && existing.two_factor_enabled) {
      return res.status(400).json({ 
        error: 'Two-factor authentication is already enabled' 
      });
    }

    // Generate new secret
    const secret = twoFactorService.generateSecret();
    
    // Generate QR code URL
    const qrCodeUrl = twoFactorService.generateQRCodeURL(secret, userEmail);

    // Store temporary secret (not enabled yet)
    await pool.query(`
      UPDATE users 
      SET two_factor_secret = $1, two_factor_enabled = false
      WHERE id = $2
    `, [secret, userId]);

    res.json({
      secret,
      qrCodeUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code to enable 2FA'
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to setup two-factor authentication' });
  }
});

/**
 * Enable 2FA - Verify TOTP code and enable 2FA
 */
router.post('/enable-2fa', authenticateJWT, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ 
        error: 'Valid 6-digit verification code is required' 
      });
    }

    // Get user's temporary secret
    const userData = await twoFactorService.getUserTwoFactor(userId);
    if (!userData || !userData.two_factor_secret) {
      return res.status(400).json({ 
        error: 'No 2FA setup found. Please setup 2FA first.' 
      });
    }

    // Verify the token
    const isValid = twoFactorService.verifyToken(token, userData.two_factor_secret);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid verification code. Please try again.' 
      });
    }

    // Enable 2FA
    const success = await twoFactorService.enableTwoFactor(userId, userData.two_factor_secret);
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to enable two-factor authentication' 
      });
    }

    // Log security event
    await logSecurityEvent(userId, 'enable_2fa', req);

    res.json({ 
      message: 'Two-factor authentication enabled successfully',
      enabled: true 
    });

  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({ error: 'Failed to enable two-factor authentication' });
  }
});

/**
 * Disable 2FA - Verify password and disable 2FA
 */
router.post('/disable-2fa', authenticateJWT, async (req, res) => {
  try {
    const { password, token } = req.body;
    const userId = req.user.id;

    if (!password) {
      return res.status(400).json({ 
        error: 'Password is required to disable 2FA' 
      });
    }

    // Get user data
    const userResult = await pool.query(`
      SELECT password_hash, two_factor_enabled, two_factor_secret
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // If 2FA is enabled, verify the token
    if (user.two_factor_enabled && user.two_factor_secret) {
      if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
        return res.status(400).json({ 
          error: 'Valid 6-digit verification code is required' 
        });
      }

      const isTokenValid = twoFactorService.verifyToken(token, user.two_factor_secret);
      if (!isTokenValid) {
        return res.status(400).json({ 
          error: 'Invalid verification code' 
        });
      }
    }

    // Disable 2FA
    const success = await twoFactorService.disableTwoFactor(userId);
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to disable two-factor authentication' 
      });
    }

    // Log security event
    await logSecurityEvent(userId, 'disable_2fa', req);

    res.json({ 
      message: 'Two-factor authentication disabled successfully',
      enabled: false 
    });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable two-factor authentication' });
  }
});

/**
 * Verify 2FA token during login
 */
router.post('/verify-2fa', authRateLimit, async (req, res) => {
  try {
    const { tempToken, token } = req.body;

    if (!tempToken || !token) {
      return res.status(400).json({ 
        error: 'Temporary token and verification code are required' 
      });
    }

    if (token.length !== 6 || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ 
        error: 'Valid 6-digit verification code is required' 
      });
    }

    // Verify temporary token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
      if (!decoded.temp2fa || !decoded.userId) {
        throw new Error('Invalid temporary token');
      }
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired temporary token' });
    }

    // Get user's 2FA secret
    const userData = await twoFactorService.getUserTwoFactor(decoded.userId);
    if (!userData || !userData.two_factor_enabled || !userData.two_factor_secret) {
      return res.status(400).json({ 
        error: 'Two-factor authentication not enabled for this user' 
      });
    }

    // Verify TOTP token
    const isValid = twoFactorService.verifyToken(token, userData.two_factor_secret);
    if (!isValid) {
      await logSecurityEvent(decoded.userId, 'failed_2fa_verification', req);
      return res.status(400).json({ 
        error: 'Invalid verification code' 
      });
    }

    // Get full user data
    const userResult = await pool.query(`
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Update last login
    await pool.query(`
      UPDATE users 
      SET last_login_at = CURRENT_TIMESTAMP, 
          last_login_ip = $1,
          failed_login_attempts = 0
      WHERE id = $2
    `, [req.ip, user.id]);

    // Create final JWT token
    const finalToken = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role_name,
        twoFactorVerified: true
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Remove sensitive data
    delete user.password_hash;
    delete user.two_factor_secret;
    user.role = user.role_name;
    delete user.role_name;

    // Log successful 2FA verification
    await logSecurityEvent(user.id, 'successful_2fa_verification', req);

    res.json({
      user,
      token: finalToken,
      message: 'Two-factor authentication successful'
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: 'Two-factor authentication verification failed' });
  }
});

/**
 * Get 2FA status for current user
 */
router.get('/2fa-status', authenticateJWT, async (req, res) => {
  try {
    const userData = await twoFactorService.getUserTwoFactor(req.user.id);
    
    res.json({
      enabled: userData ? userData.two_factor_enabled : false,
      hasSecret: userData ? !!userData.two_factor_secret : false
    });

  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

/**
 * Helper function to log security events
 */
async function logSecurityEvent(userId, action, req, details = {}) {
  try {
    await pool.query(`
      INSERT INTO security_audit (user_id, action, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      userId,
      action,
      req.ip,
      req.get('User-Agent'),
      JSON.stringify(details)
    ]);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

export default router;
