import { pool } from '../db.js';

/**
 * Enhanced Permission Service
 * Provides granular role-based access control with resource-level permissions
 */
class PermissionService {
  constructor() {
    // Cache for permissions to avoid database hits
    this.permissionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if user has specific permission
   * @param {number} userId - User ID
   * @param {string} permission - Permission string (e.g., 'bookings:read', 'users:write')
   * @param {string} resource - Optional resource ID for resource-specific permissions
   * @returns {Promise<boolean>} True if user has permission
   */
  async hasPermission(userId, permission, resource = null) {
    try {
      const cacheKey = `${userId}:${permission}:${resource || 'global'}`;
      
      // Check cache first
      if (this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.hasPermission;
        }
        this.permissionCache.delete(cacheKey);
      }

      // Get user role and permissions
      const result = await pool.query(`
        SELECT 
          r.name as role_name,
          r.permissions,
          u.two_factor_enabled,
          u.account_locked,
          u.account_expired_at
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `, [userId]);

      if (result.rows.length === 0) {
        return false;
      }

      const user = result.rows[0];

      // Check account status
      if (user.account_locked) {
        return false;
      }

      if (user.account_expired_at && new Date(user.account_expired_at) < new Date()) {
        return false;
      }

      // Parse permission
      const [action, scope] = permission.split(':');
      if (!action || !scope) {
        return false;
      }

      // Check role permissions
      const rolePermissions = user.permissions || {};
      const hasPermission = this.checkRolePermission(rolePermissions, action, scope, resource);

      // Cache result
      this.permissionCache.set(cacheKey, {
        hasPermission,
        timestamp: Date.now()
      });

      return hasPermission;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check role permission against action and scope
   * @private
   */
  checkRolePermission(rolePermissions, action, scope, resource) {
    // Check for wildcard permissions
    if (rolePermissions['*'] === true || rolePermissions[`${scope}:*`] === true) {
      return true;
    }

    // Check specific permission
    const permissionKey = `${scope}:${action}`;
    if (rolePermissions[permissionKey] === true) {
      return true;
    }

    // Check resource-specific permissions (future enhancement)
    if (resource && rolePermissions[`${permissionKey}:${resource}`] === true) {
      return true;
    }

    return false;
  }

  /**
   * Get all permissions for a user
   * @param {number} userId - User ID
   * @returns {Promise<object>} User permissions object
   */
  async getUserPermissions(userId) {
    try {
      const result = await pool.query(`
        SELECT 
          r.name as role_name,
          r.permissions,
          r.description as role_description
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return null;
    }
  }

  /**
   * Clear permission cache for user
   * @param {number} userId - User ID
   */
  clearUserCache(userId) {
    for (const [key] of this.permissionCache) {
      if (key.startsWith(`${userId}:`)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * Clear all permission cache
   */
  clearAllCache() {
    this.permissionCache.clear();
  }

  /**
   * Middleware factory for route protection
   * @param {string} permission - Required permission
   * @param {string} resourceParam - Optional request parameter containing resource ID
   * @returns {Function} Express middleware
   */
  requirePermission(permission, resourceParam = null) {
    return async (req, res, next) => {
      try {
        if (!req.user || !req.user.id) {
          return res.status(401).json({ 
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        const resource = resourceParam ? req.params[resourceParam] : null;
        const hasPermission = await this.hasPermission(req.user.id, permission, resource);

        if (!hasPermission) {
          return res.status(403).json({ 
            error: 'Insufficient permissions',
            code: 'PERMISSION_DENIED',
            required: permission
          });
        }

        next();
      } catch (error) {
        console.error('Permission middleware error:', error);
        res.status(500).json({ 
          error: 'Permission check failed',
          code: 'PERMISSION_ERROR'
        });
      }
    };
  }

  /**
   * Check if user requires 2FA for sensitive operations
   * @param {number} userId - User ID
   * @param {string} operation - Operation type
   * @returns {Promise<boolean>} True if 2FA is required
   */
  async requires2FA(userId, operation) {
    const sensitiveOperations = [
      'users:delete',
      'finances:write',
      'settings:write',
      'system:admin'
    ];

    if (!sensitiveOperations.includes(operation)) {
      return false;
    }

    try {
      const result = await pool.query(`
        SELECT two_factor_enabled, role_id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return true; // Require 2FA if user not found
      }

      const user = result.rows[0];
      
      // Always require 2FA for admin operations if user has 2FA enabled
      return user.two_factor_enabled === true;
    } catch (error) {
      console.error('Error checking 2FA requirement:', error);
      return true; // Fail safe - require 2FA on error
    }
  }
}

export default new PermissionService();
