// backend/middlewares/security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

/**
 * Security Middleware Configuration
 * Implements comprehensive security measures for production
 */

// Security Headers with Helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for development
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Rate Limiting Configuration
export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window for faster reset
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // Massive limits for development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for development if needed
    return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  }
});

// Stricter rate limiting for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 10, // Stricter for auth
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Rate limiting for 2FA attempts
export const twoFactorRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 minutes
  message: {
    error: 'Too many 2FA verification attempts, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per IP and user combination for 2FA
    return `2fa_${req.ip}_${req.body.tempToken || 'unknown'}`;
  }
});

// Rate limiting for password reset attempts
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `pwd_reset_${req.ip}_${req.body.email || 'unknown'}`;
  }
});

// Rate limiting for form submissions (public forms)
export const formSubmissionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 100 : 10, // 10 submissions per hour per IP
  message: {
    error: 'Too many form submissions from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per IP and form code combination
    return `form_submit_${req.ip}_${req.params.code || 'unknown'}`;
  },
  skipSuccessfulRequests: false // Count all attempts
});

// Rate limiting for payment callbacks (Iyzico, etc.)
export const paymentCallbackRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'development' ? 50 : 10, // 10 callbacks per minute per IP
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

// XSS protection
export const sanitizeInput = (fields) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        // Basic XSS protection - remove script tags and javascript: URLs
        req.body[field] = req.body[field]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
    });
    next();
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
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        process.env.FRONTEND_URL
      ].filter(Boolean);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
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
  formSubmissionRateLimit,
  validateInput,
  sanitizeInput,
  securityResponseHeaders,
  configureCORS,
  commonValidations,
  logSecurityEvent
};
