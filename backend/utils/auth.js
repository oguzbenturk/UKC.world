import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import bcrypt from 'bcrypt';
import { logger } from '../middlewares/errorHandler.js';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Application cannot start without it.');
}
const JWT_SECRET = process.env.JWT_SECRET;

// Authenticate JWT token middleware
export const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Reject temporary 2FA tokens — they must not be used as full session tokens
    if (decoded.temp2fa) {
      return res.status(401).json({ error: 'Two-factor authentication required.' });
    }

    if (!decoded.id) {
      return res.status(401).json({ error: 'Invalid token format.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

// Authorize based on user roles
export const authorizeRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Access denied. Not authenticated.' });
      }

      // Get user's role from database
      const roleResult = await pool.query(
        `SELECT r.name as role_name 
         FROM users u 
         JOIN roles r ON u.role_id = r.id 
         WHERE u.id = $1`,
        [req.user.id]
      );

      const userRole = roleResult.rows[0]?.role_name;

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Access denied. Not authorized for this resource.' 
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization error:', error);
      return res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
};

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Encrypt sensitive data
export const encryptData = async (data) => {
  const saltRounds = 10;
  const hashedData = await bcrypt.hash(data, saltRounds);
  return hashedData;
};

// Compare encrypted data
export const compareEncryptedData = async (data, hashedData) => {
  const isMatch = await bcrypt.compare(data, hashedData);
  return isMatch;
};

// Ensure sensitive data is encrypted
export const ensureSensitiveDataEncrypted = async (req, res, next) => {
  try {
    const sensitiveData = req.body.sensitiveData;
    if (sensitiveData) {
      req.body.sensitiveData = await encryptData(sensitiveData);
    }
    next();
  } catch (error) {
    logger.error('Error encrypting sensitive data:', error);
    return res.status(500).json({ error: 'Internal server error during data encryption' });
  }
};

// Ensure robust authentication and authorization mechanisms
export const ensureRobustAuth = (req, res, next) => {
  authenticateJWT(req, res, () => {
    authorizeRoles('admin', 'user')(req, res, next);
  });
};
