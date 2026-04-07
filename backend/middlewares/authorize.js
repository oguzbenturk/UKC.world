import rateLimit from 'express-rate-limit';
import xss from 'xss';
import { body as _body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { logger } from './errorHandler.js';

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
    logger.error('Error fetching role permissions', error);
    return {};
  }
}

// Map route base paths to permission scopes
const ROUTE_SCOPE_MAP = {
  '/bookings': 'bookings',
  '/enhanced-bookings': 'bookings',
  '/group-bookings': 'bookings',
  '/group-lesson-requests': 'bookings',
  '/events': 'bookings',
  '/reschedule-notifications': 'bookings',
  '/users': 'users',
  '/students': 'users',
  '/student-portal': 'users',
  '/family': 'users',
  '/roles': 'users',
  '/user-consents': 'users',
  '/user-relationships': 'users',
  '/finances': 'finances',
  '/payments': 'finances',
  '/currencies': 'finances',
  '/business-expenses': 'finances',
  '/admin-reconciliation': 'finances',
  '/financial-settings': 'finances',
  '/finance-daily': 'finances',
  '/manager-commissions': 'finances',
  '/vouchers': 'finances',
  '/shop-orders': 'finances',
  '/wallet': 'wallet',
  '/instructors': 'instructors',
  '/instructor': 'instructors',
  '/instructor-commissions': 'instructors',
  '/equipment': 'equipment',
  '/rentals': 'equipment',
  '/repair-requests': 'equipment',
  '/spare-parts': 'equipment',
  '/services': 'services',
  '/accommodation': 'services',
  '/products': 'services',
  '/member-offerings': 'services',
  '/forms': 'services',
  '/form-templates': 'services',
  '/form-submissions': 'services',
  '/ratings': 'services',
  '/feedback': 'services',
  '/waivers': 'services',
  '/settings': 'settings',
  '/quick-links': 'settings',
  '/weather': 'settings',
  '/dashboard': 'reports',
  '/metrics': 'reports',
  '/notifications': 'notifications',
  '/chat': 'notifications',
  '/marketing': 'notifications',
  '/popups': 'notifications',
  '/audit-logs': 'audit',
  '/admin': 'system',
  '/system': 'system',
  '/debug': 'system',
  '/upload': 'system',
};

// Derive permission scope from request path
function getPermissionScope(reqPath) {
  // Strip /api prefix if present
  const path = reqPath.replace(/^\/api/, '');
  
  // Try exact segment match first (e.g., /bookings/123 → /bookings)
  const basePath = '/' + (path.split('/')[1] || '');
  return ROUTE_SCOPE_MAP[basePath] || null;
}

// Derive permission action from HTTP method
function getPermissionAction(method) {
  switch (method) {
    case 'GET': return 'read';
    case 'POST': return 'write';
    case 'PUT':
    case 'PATCH': return 'write';
    case 'DELETE': return 'delete';
    default: return 'read';
  }
}

// Check if a permissions object grants a specific permission
function checkPermission(permissions, scope, action) {
  if (!permissions || typeof permissions !== 'object') return false;
  // Full wildcard access
  if (permissions['*'] === true) return true;
  // Scope wildcard (e.g., "bookings:*")
  if (permissions[`${scope}:*`] === true) return true;
  // Exact match (e.g., "bookings:read")
  if (permissions[`${scope}:${action}`] === true) return true;
  // Write implies read
  if (action === 'read' && permissions[`${scope}:write`] === true) return true;
  return false;
}

// Middleware to authorize based on user roles AND permissions
// SEC-014 FIX: Added granular permission checking
export const authorizeRoles = (allowedRoles, requiredPermission = null) => {
  return async (req, res, next) => {
    const userRole = req.user && req.user.role;
    const elevatedRoles = ['admin', 'manager', 'instructor'];
    const effectiveRoles = new Set(allowedRoles);

    // Grant owners access to any route intended for management-level roles
    if (!effectiveRoles.has('owner') && allowedRoles.some(role => elevatedRoles.includes(role))) {
      effectiveRoles.add('owner');
    }

    // trusted_customer inherits all student-level access
    if (effectiveRoles.has('student')) {
      effectiveRoles.add('trusted_customer');
    }
    
    // First check: Direct role name match (backward compatible)
    if (userRole && effectiveRoles.has(userRole)) {
      return next();
    }
    
    // Second check: JSONB permission-based access for custom/non-matching roles
    if (userRole) {
      try {
        const permissions = await getRolePermissions(userRole);
        
        // Determine the required permission
        let permToCheck = requiredPermission;

        if (!permToCheck) {
          // Auto-derive from route path + HTTP method
          const scope = getPermissionScope(req.originalUrl || req.path);
          const action = getPermissionAction(req.method);
          if (scope) {
            permToCheck = `${scope}:${action}`;
          }
        }

        if (permToCheck) {
          const [scope, action] = permToCheck.split(':');
          if (checkPermission(permissions, scope, action || 'read')) {
            return next();
          }
        }
        
        // Full access wildcard check (even if scope couldn't be derived)
        if (permissions && permissions['*'] === true) {
          return next();
        }
      } catch (error) {
        logger.error('Permission check error', error);
        return res.status(500).json({ error: 'Permission check failed' });
      }
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
