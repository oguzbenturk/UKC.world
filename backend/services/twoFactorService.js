import crypto from 'crypto';
import { pool } from '../db.js';

/**
 * Two-Factor Authentication Service
 * Provides TOTP-based 2FA functionality for enhanced security
 */
class TwoFactorAuthService {
  constructor() {
    this.algorithm = 'sha1';
    this.period = 30; // 30 seconds
    this.digits = 6;
    this.window = 1; // Allow 1 period before/after for clock skew
  }

  /**
   * Generate a secret key for TOTP
   * @returns {string} Base32 encoded secret
   */
  generateSecret() {
    const buffer = crypto.randomBytes(20);
    return this.base32Encode(buffer);
  }

  /**
   * Generate TOTP code for a given secret
   * @param {string} secret - Base32 encoded secret
   * @param {number} timestamp - Unix timestamp (optional, defaults to now)
   * @returns {string} 6-digit TOTP code
   */
  generateToken(secret, timestamp = Date.now()) {
    const key = this.base32Decode(secret);
    const time = Math.floor(timestamp / 1000 / this.period);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
    timeBuffer.writeUInt32BE(time & 0xffffffff, 4);

    const hmac = crypto.createHmac(this.algorithm, key);
    hmac.update(timeBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const code = ((digest[offset] & 0x7f) << 24) |
                 ((digest[offset + 1] & 0xff) << 16) |
                 ((digest[offset + 2] & 0xff) << 8) |
                 (digest[offset + 3] & 0xff);

    const token = (code % Math.pow(10, this.digits)).toString();
    return token.padStart(this.digits, '0');
  }

  /**
   * Verify TOTP code against secret
   * @param {string} token - 6-digit TOTP code
   * @param {string} secret - Base32 encoded secret
   * @returns {boolean} True if valid
   */
  verifyToken(token, secret) {
    const currentTime = Date.now();
    
    // Check current time and window around it
    for (let i = -this.window; i <= this.window; i++) {
      const testTime = currentTime + (i * this.period * 1000);
      const expectedToken = this.generateToken(secret, testTime);
      
      if (token === expectedToken) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate QR code URL for TOTP setup
   * @param {string} secret - Base32 encoded secret
   * @param {string} email - User email
   * @param {string} issuer - App name
   * @returns {string} QR code URL
   */
  generateQRCodeURL(secret, email, issuer = 'Plannivo') {
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: this.algorithm.toUpperCase(),
      digits: this.digits,
      period: this.period
    });
    
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params}`;
  }

  /**
   * Enable 2FA for a user
   * @param {number} userId - User ID
   * @param {string} secret - Base32 encoded secret
   * @returns {Promise<boolean>} Success status
   */
  async enableTwoFactor(userId, secret) {
    try {
      await pool.query(`
        UPDATE users 
        SET two_factor_secret = $1, 
            two_factor_enabled = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [secret, userId]);
      
      return true;
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      return false;
    }
  }

  /**
   * Disable 2FA for a user
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async disableTwoFactor(userId) {
    try {
      await pool.query(`
        UPDATE users 
        SET two_factor_secret = NULL, 
            two_factor_enabled = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId]);
      
      return true;
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      return false;
    }
  }

  /**
   * Get user's 2FA status and secret
   * @param {number} userId - User ID
   * @returns {Promise<object>} 2FA data
   */
  async getUserTwoFactor(userId) {
    try {
      const result = await pool.query(`
        SELECT two_factor_enabled, two_factor_secret 
        FROM users 
        WHERE id = $1
      `, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting user 2FA data:', error);
      return null;
    }
  }

  /**
   * Base32 encoding (RFC 4648)
   */
  base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let encoded = '';
    let value = 0;
    let bits = 0;

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        encoded += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      encoded += alphabet[(value << (5 - bits)) & 31];
    }

    // Add padding
    while (encoded.length % 8 !== 0) {
      encoded += '=';
    }

    return encoded;
  }

  /**
   * Base32 decoding (RFC 4648)
   */
  base32Decode(encoded) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    encoded = encoded.toUpperCase().replace(/=+$/, '');
    
    const decoded = [];
    let value = 0;
    let bits = 0;

    for (let i = 0; i < encoded.length; i++) {
      const index = alphabet.indexOf(encoded[i]);
      if (index === -1) {
        throw new Error('Invalid base32 character');
      }

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        decoded.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(decoded);
  }
}

export default new TwoFactorAuthService();
