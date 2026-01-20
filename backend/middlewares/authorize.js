import rateLimit from 'express-rate-limit';
import xss from 'xss';
import { body as _body, validationResult } from 'express-validator';

// Middleware to authorize based on user roles
export const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user && req.user.role; // This is correct based on JWT token structure
    const elevatedRoles = ['admin', 'manager', 'instructor'];
    const effectiveRoles = new Set(allowedRoles);

    // Grant owners access to any route intended for management-level roles
    if (!effectiveRoles.has('owner') && allowedRoles.some(role => elevatedRoles.includes(role))) {
      effectiveRoles.add('owner');
    }
    
    // Only log for DELETE requests to finances
    if (req.method === 'DELETE' && req.originalUrl.includes('/finances/transactions/')) {
      console.log('🔐 Authorization check for DELETE transaction:');
      console.log('   User:', req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'No user');
      console.log('   Required roles:', allowedRoles);
      console.log('   User role:', userRole);
      console.log('   Role match:', effectiveRoles.has(userRole));
    }
    
    if (!userRole || !effectiveRoles.has(userRole)) {
      if (req.method === 'DELETE' && req.originalUrl.includes('/finances/transactions/')) {
        console.log('❌ Authorization failed: insufficient permissions');
      }
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    
    if (req.method === 'DELETE' && req.originalUrl.includes('/finances/transactions/')) {
      console.log('✅ Authorization successful');
    }
    next();
  };
};

// Middleware to validate input
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

// Middleware to sanitize input
export const sanitizeInput = (fields) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field]) {
        req.body[field] = xss(req.body[field]);
      }
    });
    next();
  };
};

// Rate limiting middleware
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
