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
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for development if needed
    return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  }
});

// Very strict rate limiting for password reset
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input Validation Schemas
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

export const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
];

export const validateBooking = [
  body('date')
    .isISO8601()
    .withMessage('Valid date is required'),
  body('start_hour')
    .isInt({ min: 0, max: 23 })
    .withMessage('Start hour must be between 0 and 23'),
  body('duration')
    .isInt({ min: 1, max: 8 })
    .withMessage('Duration must be between 1 and 8 hours'),
  body('student_user_id')
    .isInt({ min: 1 })
    .withMessage('Valid student ID is required'),
  body('instructor_user_id')
    .isInt({ min: 1 })
    .withMessage('Valid instructor ID is required'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
];

export const validateEquipment = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Equipment name must be between 2 and 100 characters'),
  body('type')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Equipment type is required'),
  body('serial_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Serial number must not exceed 50 characters'),
  body('purchase_date')
    .optional()
    .isISO8601()
    .withMessage('Valid purchase date is required'),
];

// Validation Error Handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// SQL Injection Prevention
export const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters from string inputs
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/[<>'"]/g, '') // Remove dangerous HTML/SQL characters
        .trim();
    }
    return value;
  };

  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        obj[key] = sanitizeValue(obj[key]);
      });
    }
    return obj;
  };
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && Object.keys(req.query).length > 0) {
    // Can't directly assign to req.query, so sanitize in place
    const sanitizedQuery = sanitizeObject(req.query);
    Object.keys(req.query).forEach(key => delete req.query[key]);
    Object.assign(req.query, sanitizedQuery);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Security Response Headers
export const securityResponseHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

// Environment-based CORS
export const configureCORS = () => {
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://plannivo.com']
    : [
        'http://localhost:3000',
        'http://localhost:3003', 
        'http://localhost:3004',
        'http://localhost:2999'
      ];

  return {
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || 
          (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
};
