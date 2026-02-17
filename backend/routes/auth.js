import express from 'express';
import pg from 'pg';
import { pool } from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import twoFactorService from '../services/twoFactorService.js';
import permissionService from '../services/permissionService.js';
import { authRateLimit, passwordResetRateLimit } from '../middlewares/security.js';
import { logger } from '../middlewares/errorHandler.js';
import { getConsentStatus, LATEST_TERMS_VERSION } from '../services/userConsentService.js';
import { requestPasswordReset, validateResetToken, resetPassword } from '../services/passwordResetService.js';
import { cacheService } from '../services/cacheService.js';

const router = express.Router();

// Environment variables - CRITICAL: No fallbacks for security-critical values
// SEC-002 FIX: Removed hardcoded fallback - application will crash if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Application cannot start without it.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';
const MAX_FAILED_LOGINS = parseInt(process.env.MAX_FAILED_LOGINS) || 5;
const ACCOUNT_LOCK_DURATION = parseInt(process.env.ACCOUNT_LOCK_DURATION) || 1800; // 30 minutes

// Enhanced login endpoint with 2FA support and security features
router.post('/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email with security fields (exclude soft-deleted users)
    const userResult = await pool.query(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1 AND u.deleted_at IS NULL
    `, [email]);

    if (userResult.rows.length === 0) {
      // Log failed login attempt
      await logSecurityEvent(null, 'failed_login_invalid_user', req, { email });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Check account lock status
    if (user.account_locked) {
      const lockTime = new Date(user.account_locked_at);
      const unlockTime = new Date(lockTime.getTime() + (ACCOUNT_LOCK_DURATION * 1000));
      
      if (new Date() < unlockTime) {
        await logSecurityEvent(user.id, 'login_attempt_locked_account', req);
        return res.status(423).json({ 
          error: 'Account is temporarily locked due to multiple failed login attempts',
          unlockTime: unlockTime.toISOString()
        });
      } else {
        // Unlock account if lock period has expired
        await pool.query(`
          UPDATE users 
          SET account_locked = false, 
              account_locked_at = NULL, 
              failed_login_attempts = 0
          WHERE id = $1
        `, [user.id]);
        user.account_locked = false;
        user.failed_login_attempts = 0;
      }
    }

    // Check account expiration
    if (user.account_expired_at && new Date(user.account_expired_at) < new Date()) {
      await logSecurityEvent(user.id, 'login_attempt_expired_account', req);
      return res.status(423).json({ error: 'Account has expired' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_LOGINS;

      await pool.query(`
        UPDATE users 
        SET failed_login_attempts = $1,
            last_failed_login_at = CURRENT_TIMESTAMP,
            account_locked = $2,
            account_locked_at = $3
        WHERE id = $4
      `, [
        newFailedAttempts,
        shouldLock,
        shouldLock ? new Date() : null,
        user.id
      ]);

      await logSecurityEvent(user.id, 'failed_login_invalid_password', req, {
        failedAttempts: newFailedAttempts,
        accountLocked: shouldLock
      });

      if (shouldLock) {
        return res.status(423).json({ 
          error: 'Account locked due to multiple failed login attempts',
          lockDuration: ACCOUNT_LOCK_DURATION
        });
      }

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled && user.two_factor_secret) {
      // Create temporary token for 2FA verification
      // SEC-007: Add jti for token revocation support
      const tempToken = jwt.sign(
        { 
          userId: user.id,
          temp2fa: true,
          jti: crypto.randomBytes(16).toString('hex')
        },
        JWT_SECRET,
        { expiresIn: '10m' } // 10 minutes to complete 2FA
      );

      await logSecurityEvent(user.id, 'login_2fa_required', req);

      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Two-factor authentication required'
      });
    }

    // Standard login success
    await completeLogin(user, req, res);

  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware for JWT authentication
export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  // SEC-009 FIX: Debug logging only in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔐 JWT Auth Debug:');
    console.log('   URL:', req.method, req.originalUrl);
    console.log('   Auth Header:', authHeader ? 'Present' : 'Missing');
    console.log('   Token:', token ? 'Present' : 'Missing');
  }
  
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.log('❌ Auth failed: No token provided');
    }
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Token verified successfully');
      console.log('   User ID:', verified.id);
      console.log('   User Role:', verified.role);
    }
    
    if (!verified || !verified.id) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Auth failed: Invalid token format');
      }
      return res.status(401).json({ error: 'Invalid token format' });
    }
    
    // SEC-007: Check if token is blacklisted (revoked)
    if (verified.jti) {
      const isBlacklisted = await cacheService.exists(`blacklist:${verified.jti}`);
      if (isBlacklisted) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Auth failed: Token has been revoked');
        }
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
      }
    }
    
    req.user = verified;
    req.token = token; // Store token for logout
    next();
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.log('❌ Auth failed:', err.name, err.message);
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please log in again.' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }
    
    return res.status(401).json({ error: 'Authentication failed. Please log in again.' });
  }
};

// Get current user endpoint
router.get('/me', authenticateJWT, async (req, res) => {
  try {
    // SEC-009 FIX: Only log in development, and only user ID (not full data)
    if (process.env.NODE_ENV === 'development') {
      console.log('GET /auth/me - User ID from token:', req.user?.id);
    }
    
    // Safety check for missing user ID
    if (!req.user || !req.user.id) {
      if (process.env.NODE_ENV === 'development') {
        console.error('GET /auth/me - Missing user ID in token');
      }
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    try {      // Simplified query with the correct column name
      const query = `
        SELECT 
          u.id, 
          u.email, 
          COALESCE(u.name, CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as name,
          u.first_name, 
          u.last_name,
          u.created_at, 
          u.updated_at,
          u.profile_image_url,
          u.preferred_currency,
          r.name as role_name,
          r.permissions as role_permissions
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
      `;
      
      console.log('Executing query with user ID:', req.user.id);
      console.log('DB Pool status:', pool ? 'Available' : 'Not available');
      
      // Check if pool is available before querying
      if (!pool) {
        throw new Error('Database connection pool is not available');
      }
      
      const result = await pool.query(query, [req.user.id]);
      console.log('Query executed, rows returned:', result.rows.length);
      
      if (result.rows.length === 0) {
        console.error(`GET /auth/me - User not found: ${req.user.id}`);
        return res.status(404).json({ error: 'User not found' });
      }
      
      const user = result.rows[0];

      try {
        const consent = await getConsentStatus(user.id);
        user.consent = consent;
      } catch (consentError) {
        logger.warn('Failed to load consent status for /auth/me', {
          userId: user.id,
          error: consentError.message
        });
      }
      
      // Set role property and ensure we have a valid name
      user.role = user.role_name || 'user';
      delete user.role_name;
      
      // Include role permissions for custom role sidebar filtering
      user.permissions = user.role_permissions || {};
      delete user.role_permissions;
      
      // Create a mock user if needed for testing
      if (!user.name) {
        user.name = user.email.split('@')[0];
      }
      
      // SEC-009 FIX: Don't log full user object in production (contains permissions, roles, etc.)
      if (process.env.NODE_ENV === 'development') {
        console.log(`GET /auth/me - Successfully retrieved user ID:`, user.id);
      }
      return res.json(user);
    } catch (dbErr) {
      console.error('Database error in /auth/me:', dbErr);
      
      // SEC-010 FIX: Don't trust token data during DB outage
      // If DB is unreachable, user's actual status (role, active, etc.) cannot be verified
      // Return 503 Service Unavailable instead of serving potentially stale token data
      logger.error('Database unavailable in /auth/me - cannot verify user status', {
        userId: req.user.id,
        error: dbErr.message
      });
      
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        message: 'Unable to verify user credentials. Please try again later.',
        code: 'DB_UNAVAILABLE'
      });
    }
  } catch (err) {
    console.error('Error getting current user:', err);
    res.status(500).json({ error: 'Failed to get current user', details: err.message });
  }
});

// Refresh token endpoint - issues a new JWT with current role from database
router.post('/refresh-token', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get current user data from database (with updated role)
    const result = await pool.query(`
      SELECT u.id, u.email, r.name as role_name, u.two_factor_enabled
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Create new JWT token with current role
    // SEC-007: Include jti for token revocation support
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role_name,
        twoFactorVerified: !user.two_factor_enabled,
        jti: crypto.randomBytes(16).toString('hex')
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    // Get full user data for frontend
    const fullUserResult = await pool.query(`
      SELECT 
        u.id, 
        u.email, 
        COALESCE(u.name, CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as name,
        u.first_name, 
        u.last_name,
        u.created_at, 
        u.updated_at,
        u.profile_image_url,
        r.name as role
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [userId]);
    
    const userData = fullUserResult.rows[0];
    
    // Get consent status
    let consent = null;
    try {
      consent = await getConsentStatus(userId);
      userData.consent = consent;
    } catch (consentError) {
      logger.warn('Failed to load consent status for token refresh', {
        userId,
        error: consentError.message
      });
    }
    
    logger.info('Token refreshed for user', { userId, newRole: user.role_name });
    
    res.json({
      token,
      user: userData,
      consent,
      message: 'Token refreshed successfully'
    });
  } catch (err) {
    console.error('Error refreshing token:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Logout endpoint with token revocation (SEC-007)
router.post('/logout', authenticateJWT, async (req, res) => {
  try {
    // SEC-007: Add token to blacklist in Redis
    if (req.user.jti) {
      // Calculate TTL based on token exp claim (or use default 24h)
      const now = Math.floor(Date.now() / 1000);
      const exp = req.user.exp || (now + 86400); // Default 24h if no exp
      const ttl = Math.max(exp - now, 60); // At least 60 seconds
      
      await cacheService.set(`blacklist:${req.user.jti}`, {
        userId: req.user.id,
        logoutAt: new Date().toISOString()
      }, ttl);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🚫 Token blacklisted: ${req.user.jti} (TTL: ${ttl}s)`);
      }
    }
    
    // Log logout event
    await logSecurityEvent(req.user.id, 'logout', req);
    
    res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Public registration endpoint for outsider role
router.post('/register', authRateLimit, async (req, res) => {
  const { 
    first_name, 
    last_name, 
    email, 
    phone, 
    password,
    age,
    weight,
    preferred_currency
  } = req.body;

  // Validate required fields
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required' });
  }

  // Validate preferred_currency against allowed registration currencies
  if (preferred_currency) {
    try {
      const allowedCurrenciesResult = await pool.query(
        "SELECT value FROM settings WHERE key = 'allowed_registration_currencies'"
      );
      const allowedCurrencies = allowedCurrenciesResult.rows[0]?.value || ['EUR', 'USD', 'TRY'];
      
      if (!allowedCurrencies.includes(preferred_currency)) {
        return res.status(400).json({ 
          error: `Currency ${preferred_currency} is not allowed for registration. Allowed currencies: ${allowedCurrencies.join(', ')}` 
        });
      }
    } catch (currencyCheckError) {
      // Log error but don't block registration
      logger.warn('Failed to validate currency against allowed list', { error: currencyCheckError.message });
    }
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // SEC-042 FIX: Strong password validation
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  // Password must contain: uppercase, lowercase, number, and special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ 
      error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    });
  }

  // Validate age if provided
  if (age && (age < 10 || age > 100)) {
    return res.status(400).json({ error: 'Age must be between 10 and 100' });
  }

  // Validate weight if provided
  if (weight && (weight < 30 || weight > 200)) {
    return res.status(400).json({ error: 'Weight must be between 30 and 200 kg' });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if email already exists (only for non-deleted users)
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Get or create outsider role
    let outsiderRoleId;
    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'outsider'");
    
    if (roleResult.rows.length === 0) {
      // Create outsider role if it doesn't exist
      const createRoleResult = await client.query(`
        INSERT INTO roles (id, name, description, created_at, updated_at)
        VALUES ('e1a2b3c4-d5e6-47f8-9a0b-c1d2e3f4a5b6', 'outsider', 'Self-registered users with limited access to shop and support', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = 'outsider'
        RETURNING id
      `);
      outsiderRoleId = createRoleResult.rows[0].id;
    } else {
      outsiderRoleId = roleResult.rows[0].id;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await client.query(`
      INSERT INTO users (
        email, 
        password_hash, 
        name, 
        first_name, 
        last_name, 
        phone, 
        age,
        weight,
        preferred_currency,
        role_id, 
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id, email, name, first_name, last_name, preferred_currency
    `, [
      email.toLowerCase(),
      hashedPassword,
      `${first_name} ${last_name}`,
      first_name,
      last_name,
      phone || null,
      age || null,
      weight || null,
      preferred_currency || 'EUR',
      outsiderRoleId
    ]);

    const newUser = userResult.rows[0];

    // Create wallet with user's preferred currency
    // This ensures the wallet exists with the correct currency from the start
    const userCurrency = preferred_currency || 'EUR';
    await client.query(
      `INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount)
       VALUES ($1, $2, 0, 0, 0)
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [newUser.id, userCurrency]
    );

    // Auto-enroll new user in all existing channels
    const channelsResult = await client.query(`
      SELECT id FROM conversations WHERE type = 'channel'
    `);
    
    if (channelsResult.rows.length > 0) {
      // SEC-012 FIX: Use parameterized query instead of string interpolation
      // Build array of channel IDs for parameterized query
      const channelIds = channelsResult.rows.map(channel => channel.id);
      
      // Use unnest to safely insert multiple rows with parameters
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, user_id, role_in_conversation, joined_at)
        SELECT unnest($1::uuid[]), $2::uuid, 'member', NOW()
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `, [channelIds, newUser.id]);
      
      logger.info('Auto-enrolled new user in existing channels', {
        userId: newUser.id,
        channelCount: channelsResult.rows.length
      });
    }

    await client.query('COMMIT');

    // Log registration event
    await logSecurityEvent(newUser.id, 'self_registration', req, {
      email: newUser.email,
      hasAge: !!age,
      hasWeight: !!weight
    });

    logger.info('New user self-registration completed', {
      userId: newUser.id,
      email: newUser.email,
      role: 'outsider'
    });

    res.status(201).json({
      message: 'Registration successful. Please login to complete your profile.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Registration failed:', { error: err.message, stack: err.stack });
    
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  } finally {
    client.release();
  }
});

/**
 * Complete login process after password validation
 */
async function completeLogin(user, req, res) {
  try {
    // Reset failed login attempts
    await pool.query(`
      UPDATE users 
      SET failed_login_attempts = 0,
          last_login_at = CURRENT_TIMESTAMP,
          last_login_ip = $1
      WHERE id = $2
    `, [req.ip, user.id]);

    // Create JWT token
    // SEC-007: Include jti for token revocation support
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role_name,
        twoFactorVerified: !user.two_factor_enabled,
        jti: crypto.randomBytes(16).toString('hex')
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Remove sensitive data
    delete user.password_hash;
    delete user.two_factor_secret;
    delete user.two_factor_backup_codes;
    
    // Normalize role field
    user.role = user.role_name;
    delete user.role_name;
    
    // Include role permissions for custom role sidebar filtering
    user.permissions = user.role_permissions || {};
    delete user.role_permissions;

    // Log successful login
    await logSecurityEvent(user.id, 'successful_login', req);

    let consent = null;
    try {
      consent = await getConsentStatus(user.id);
    } catch (error) {
      logger.warn('Failed to load consent status during login', { userId: user.id, error: error.message });
    }

    if (consent) {
      user.consent = consent;
    }

    // Return user data and token
    res.json({
      user,
      token,
      consent,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Error completing login:', error);
    res.status(500).json({ error: 'Login completion failed' });
  }
}

/**
 * Helper function to log security events
 */
async function logSecurityEvent(userId, action, req, details = {}) {
  try {
    await pool.query(`
      INSERT INTO security_audit (user_id, action, ip_address, user_agent, details, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
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

// =============================================
// PASSWORD RESET ENDPOINTS
// =============================================

/**
 * Request password reset email
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', passwordResetRateLimit, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await requestPasswordReset(
      email,
      req.ip,
      req.get('User-Agent')
    );

    // Log the attempt
    await logSecurityEvent(null, 'password_reset_requested', req, { email: email.substring(0, 3) + '***' });

    // Always return success to prevent email enumeration
    res.json(result);
  } catch (error) {
    logger.error('Password reset request error:', { error: error.message });
    // Still return success to prevent enumeration
    res.json({ 
      success: true, 
      message: 'If an account exists with this email, you will receive a password reset link.' 
    });
  }
});

/**
 * Validate password reset token
 * POST /api/auth/validate-reset-token
 * SEC-011 FIX: Added rate limiting to prevent brute-force attacks
 */
router.post('/validate-reset-token', passwordResetRateLimit, async (req, res) => {
  const { token, email } = req.body;

  if (!token || !email) {
    return res.status(400).json({ valid: false, error: 'Token and email are required' });
  }

  try {
    const result = await validateResetToken(token, email);
    res.json(result);
  } catch (error) {
    logger.error('Token validation error:', { error: error.message });
    res.status(500).json({ valid: false, error: 'Failed to validate token' });
  }
});

/**
 * Reset password with valid token
 * POST /api/auth/reset-password
 */
router.post('/reset-password', passwordResetRateLimit, async (req, res) => {
  const { token, email, password } = req.body;

  if (!token || !email || !password) {
    return res.status(400).json({ success: false, error: 'Token, email, and password are required' });
  }

  // SEC-042 FIX: Strong password validation for password reset
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ 
      error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    });
  }

  try {
    const result = await resetPassword(token, email, password, req.ip);

    if (result.success) {
      await logSecurityEvent(null, 'password_reset_completed', req, { email: email.substring(0, 3) + '***' });
    } else {
      await logSecurityEvent(null, 'password_reset_failed', req, { email: email.substring(0, 3) + '***', error: result.error });
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Password reset error:', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to reset password. Please try again.' });
  }
});

export default router; // Ensure this is the only default export
