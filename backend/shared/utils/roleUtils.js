/**
 * Role definitions for the Plannivo backend
 * Mirrors the frontend roleUtils.js for consistency
 */

export const ROLES = {
  OUTSIDER: 'outsider',
  STUDENT: 'student',
  TRUSTED_CUSTOMER: 'trusted_customer',
  INSTRUCTOR: 'instructor',
  MANAGER: 'manager',
  ADMIN: 'admin',
  DEVELOPER: 'developer'
};

/**
 * Roles that can use "Pay at Center" option
 */
export const PAY_AT_CENTER_ALLOWED_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.TRUSTED_CUSTOMER];

/**
 * Role hierarchy, from lowest to highest permissions
 */
const ROLE_HIERARCHY = [
  ROLES.OUTSIDER,
  ROLES.STUDENT,
  ROLES.TRUSTED_CUSTOMER,
  ROLES.INSTRUCTOR,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.DEVELOPER
];

/**
 * Get the numerical level of a role for comparison
 * @param {string} role - Role to check
 * @returns {number} Role level (higher = more permissions)
 */
export const getRoleLevel = (role) => {
  if (typeof role === 'string') {
    const roleLower = role.toLowerCase();
    const index = ROLE_HIERARCHY.findIndex(r => r.toLowerCase() === roleLower);
    if (index !== -1) return index;
  }
  return ROLE_HIERARCHY.indexOf(role);
};

/**
 * Check if a user has at least the required role level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
export const hasPermission = (userRole, requiredRole) => {
  return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
};

/**
 * Check if a role is a staff/management role
 * @param {string} role - Role to check
 * @returns {boolean}
 */
export const isStaffRole = (role) => {
  const staffRoles = [ROLES.INSTRUCTOR, ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER];
  return staffRoles.includes(role?.toLowerCase());
};

/**
 * Check if a role is an admin-level role
 * @param {string} role - Role to check
 * @returns {boolean}
 */
export const isAdminRole = (role) => {
  const adminRoles = [ROLES.ADMIN, ROLES.DEVELOPER];
  return adminRoles.includes(role?.toLowerCase());
};
