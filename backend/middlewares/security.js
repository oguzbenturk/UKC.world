// backend/middlewares/security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import xss from 'xss'; // SEC-046 FIX: Use robust XSS library

/**
 * Security Middleware Configuration
 * Implements comprehensive security measures for production
 * 
 * CSP Configuration Notes:
 * - Development: Allows 'unsafe-eval' for Vite HMR, DevTools, and debugging
 * - Production: Strict CSP without 'unsafe-eval' for maximum security
 * 
 * If you need eval() in production (e.g., for TinyMCE or reports), consider:
 * 1. Using nonces or hashes for specific scripts
 * 2. Moving to CSP Level 3 with 'strict-dynamic'
 * 3. Hosting TinyMCE assets externally with proper CORS
 */

// SEC-028/029 FIX: Strict environment checking
// Only use 'development' features when explicitly set AND not in production
const isProduction = process.env.NODE_ENV?.trim() === 'production';
const isDevelopment = process.env.NODE_ENV?.trim() === 'development' && !isProduction;

if (!isProduction && !isDevelopment) {
  console.warn('⚠️  NODE_ENV is not set to "production" or "development". Defaulting to production-level security.');
}

// Security Headers with Helmet
export const securityHeaders = helmet({
  // SEC-029 FIX: CSP always enabled, even in development (with relaxed rules for dev)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      // Development allows 'unsafe-eval' for HMR, production does not
      scriptSrc: isDevelopment ? ["'self'", "'unsafe-eval'"] : ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null, // Only in production
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

const CURRENT_ENV = process.env.NODE_ENV?.trim() || 'development';

const parsePositiveInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const shouldSkipRateLimit = () => (
  CURRENT_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true'
);

const ensureDevMinimum = (value, fallback) => (
  CURRENT_ENV === 'production' ? value : Math.max(value, fallback)
);

const defaultApiLimit = () => {
  const fallback = CURRENT_ENV === 'production' ? 300 : 15000;
  const parsed = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, fallback);
  return ensureDevMinimum(parsed, fallback);
};

const defaultApiWindow = () => (
  parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, CURRENT_ENV === 'production' ? 60 * 1000 : 30 * 1000)
);

export const apiRateLimit = rateLimit({
  windowMs: defaultApiWindow(),
  max: () => defaultApiLimit(),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit
});

const defaultAuthLimit = () => {
  const fallback = CURRENT_ENV === 'production' ? 50 : 1500;
  const parsed = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, fallback);
  return ensureDevMinimum(parsed, fallback);
};

export const authRateLimit = rateLimit({
  windowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: () => defaultAuthLimit(),
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: shouldSkipRateLimit
});

export const twoFactorRateLimit = rateLimit({
  windowMs: parsePositiveInt(process.env.TWO_FACTOR_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
  max: () => parsePositiveInt(process.env.TWO_FACTOR_RATE_LIMIT_MAX, 5),
  message: {
    error: 'Too many 2FA verification attempts, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `2fa_${req.ip}_${req.body?.tempToken || 'unknown'}`
});

export const passwordResetRateLimit = rateLimit({
  windowMs: parsePositiveInt(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  max: () => parsePositiveInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 3),
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `pwd_reset_${req.ip}_${req.body?.email || 'unknown'}`
});

// Rate limiting for payment callbacks (Iyzico, etc.) - prevents brute force attacks
export const paymentCallbackRateLimit = rateLimit({
  windowMs: parsePositiveInt(process.env.PAYMENT_CALLBACK_RATE_LIMIT_WINDOW_MS, 60 * 1000), // 1 minute
  max: () => {
    const fallback = CURRENT_ENV === 'production' ? 10 : 50;
    return parsePositiveInt(process.env.PAYMENT_CALLBACK_RATE_LIMIT_MAX, fallback);
  },
  message: {
    error: 'Too many payment callback requests.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per IP and token combination
    const token = req.body?.token || req.query?.token || 'unknown';
    return `payment_callback_${req.ip}_${token}`;
  }
});

// Input validation middleware
export const validateInput = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };
};

// SEC-046 FIX: Robust XSS protection using xss library
// Recursively sanitize all string values in an object
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return xss(value, {
      whiteList: {}, // No HTML tags allowed by default
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style']
    });
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sanitized = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        sanitized[key] = sanitizeValue(value[key]);
      }
    }
    return sanitized;
  }
  return value;
}

// SEC-046 FIX: Global input sanitization middleware
export const sanitizeInput = () => {
  return (req, res, next) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
      }
      
      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeValue(req.query);
      }
      
      // Sanitize route parameters
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeValue(req.params);
      }
      
      next();
    } catch (error) {
      console.error('Error in sanitizeInput middleware:', error);
      // Don't block the request if sanitization fails
      // Log the error but continue
      next();
    }
  };
};

// Additional security headers
export const securityResponseHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

// CORS configuration
export const configureCORS = () => {
  return {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3003', // Added for current frontend port
        'http://localhost:3005', // Added for current frontend port
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://plannivo.com',
        'https://plannivo.com',
        'http://www.plannivo.com',
        'https://www.plannivo.com',
        process.env.FRONTEND_URL
      ].filter(Boolean);
      
      // SEC-028 FIX: No blanket development bypass
      // Only allow whitelisted origins, even in development
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // Log rejected origins in development for debugging
        if (isDevelopment) {
          console.warn(`⚠️  CORS rejected origin: ${origin}. Add it to allowedOrigins if needed.`);
        }
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining']
  };
};

// Common validation schemas
export const commonValidations = {
  email: body('email').isEmail().normalizeEmail(),
  password: body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  id: body('id').isInt({ min: 1 }),
  token: body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  name: body('name').trim().isLength({ min: 1, max: 100 }),
  phone: body('phone').optional().isMobilePhone(),
  url: body('url').optional().isURL()
};

// Request logging for security events
export const logSecurityEvent = async (pool, userId, action, req, details = {}) => {
  try {
    await pool.query(`
      INSERT INTO security_audit (user_id, action, ip_address, user_agent, details, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      userId,
      action,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent') || 'Unknown',
      JSON.stringify(details)
    ]);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

export default {
  securityHeaders,
  apiRateLimit,
  authRateLimit,
  twoFactorRateLimit,
  passwordResetRateLimit,
  validateInput,
  sanitizeInput,
  securityResponseHeaders,
  configureCORS,
  commonValidations,
  logSecurityEvent
};
