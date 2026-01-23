import rateLimit from 'express-rate-limit';
import xss from 'xss';
import { body as _body, validationResult } from 'express-validator';
import { pool } from '../db.js';

// Cache for role permissions (avoid DB query on every request)
const rolePermissionsCache = new Map();
let cacheLastUpdated = Date.now();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getRolePermissions(roleName) {
  const now = Date.now();
  
  // Clear cache if expired
  if (now - cacheLastUpdated > CACHE_TTL) {
    rolePermissionsCache.clear();
    cacheLastUpdated = now;
  }
  
  // Return cached if available
  if (rolePermissionsCache.has(roleName)) {
    return rolePermissionsCache.get(roleName);
  }
  
  // Query database
  try {
    const result = await pool.query(
      'SELECT permissions FROM roles WHERE LOWER(name) = LOWER($1)',
      [roleName]
    );
    
    const permissions = result.rows[0]?.permissions || {};
    rolePermissionsCache.set(roleName, permissions);
    return permissions;
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return {};
  }
}

// Middleware to authorize based on user roles AND permissions
export const authorizeRoles = (allowedRoles) => {
  return async (req, res, next) => {
    const userRole = req.user && req.user.role;
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
    
    // First check: Direct role name match (backward compatible)
    if (userRole && effectiveRoles.has(userRole)) {
      if (req.method === 'DELETE' && req.originalUrl.includes('/finances/transactions/')) {
        console.log('✅ Authorization successful - role match');
      }
      return next();
    }
    
    // Second check: For custom roles, grant access if they have ANY permission
    // This allows custom roles like "Front Desk" to work
    if (userRole && !effectiveRoles.has(userRole)) {
      try {
        const permissions = await getRolePermissions(userRole);
        
        // If the role has any permissions, allow access to manager-level routes
        // This is a permissive approach - you can refine this later with specific permission checks
        if (Object.keys(permissions).length > 0 && Object.values(permissions).some(p => p === true)) {
          console.log(`✅ Custom role "${userRole}" granted access based on permissions`);
          return next();
        }
      } catch (error) {
        console.error('Permission check error:', error);
      }
    }
    
    if (req.method === 'DELETE' && req.originalUrl.includes('/finances/transactions/')) {
      console.log('❌ Authorization failed: insufficient permissions');
    }
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
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
