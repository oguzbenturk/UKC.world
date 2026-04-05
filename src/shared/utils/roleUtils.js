// src/utils/roleUtils.js
/**
 * Role definitions for the Plannivo application
 */
export const ROLES = {
  OUTSIDER: 'outsider', // Self-registered users - limited to shop and support
  STUDENT: 'student',
  TRUSTED_CUSTOMER: 'trusted_customer', // Verified customers who can pay at center
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
  // Handle case insensitive comparison
  if (typeof role === 'string') {
    const roleLower = role.toLowerCase();
    // Check against lowercase values in hierarchy
    const index = ROLE_HIERARCHY.findIndex(r => r.toLowerCase() === roleLower);
    if (index !== -1) return index;
  }
  return ROLE_HIERARCHY.indexOf(role);
};

/**
 * Check if a user has permission based on their role
 * @param {string} userRole - The user's role
 * @param {Array|string} allowedRoles - Roles that are allowed
 * @returns {boolean} Whether the user has permission
 */
export const hasPermission = (userRole, allowedRoles) => {
  if (!userRole) return false;
  
  // Convert to array if a single role is passed
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  // Now we can safely check if the user's role matches any allowed role
  return roles.some(role => 
    userRole.toLowerCase() === role.toLowerCase()
  );
};

/**
 * Check if a user can edit another user's data
 * @param {Object} currentUser - The user attempting to make changes
 * @param {Object} targetUser - The user being modified
 * @returns {boolean} Whether the current user can edit the target user
 */
export const canEditUser = (currentUser, targetUser) => {
  if (!currentUser || !targetUser) return false;
  
  const currentRoleLevel = getRoleLevel(currentUser.role);
  const targetRoleLevel = getRoleLevel(targetUser.role);
  
  // Users can edit themselves, or users with lower role levels
  return currentUser.id === targetUser.id || currentRoleLevel > targetRoleLevel;
};

/**
 * Get the permissions for a specific role
 * @param {string} role - Role to check
 * @returns {Object} Object containing permission flags
 */
export const getPermissionsForRole = (role) => {
  const roleLevel = getRoleLevel(role);
  const roleLower = typeof role === 'string' ? role.toLowerCase() : '';
  
  // Outsider has very limited permissions - only shop and support
  const isOutsider = roleLower === ROLES.OUTSIDER;
  
  return {
    // Basic permissions
    canViewDashboard: !isOutsider && roleLevel >= 0, // All roles except outsider
    canViewProfile: roleLevel >= 0, // All roles
    canViewShop: roleLevel >= 0, // All roles including outsider
    canViewSupport: roleLevel >= 0, // All roles including outsider
    
    // Student management
    canViewStudents: !isOutsider && roleLevel >= getRoleLevel(ROLES.INSTRUCTOR),
    canManageStudents: roleLevel >= getRoleLevel(ROLES.MANAGER),
    
    // Booking management
    canViewBookings: !isOutsider && roleLevel >= 0, // All roles except outsider
    canCreateBookings: roleLevel >= getRoleLevel(ROLES.INSTRUCTOR),
    canManageAllBookings: roleLevel >= getRoleLevel(ROLES.MANAGER),
    
    // Equipment management
    canViewEquipment: !isOutsider && roleLevel >= getRoleLevel(ROLES.INSTRUCTOR),
    canManageEquipment: roleLevel >= getRoleLevel(ROLES.MANAGER),
    
    // Instructor management
    canViewInstructors: !isOutsider && roleLevel >= getRoleLevel(ROLES.STUDENT),
    canManageInstructors: roleLevel >= getRoleLevel(ROLES.MANAGER),
    
    // Financial management
    canViewFinances: roleLevel >= getRoleLevel(ROLES.MANAGER) || role === ROLES.ADMIN,
    canManageFinances: roleLevel >= getRoleLevel(ROLES.ADMIN),
    
    // System settings
    canViewSettings: roleLevel >= getRoleLevel(ROLES.MANAGER) || role === ROLES.ADMIN,
    canManageSettings: roleLevel >= getRoleLevel(ROLES.ADMIN),
    
    // Reports
    canViewReports: roleLevel >= getRoleLevel(ROLES.MANAGER) || role === ROLES.ADMIN,
    canManageReports: roleLevel >= getRoleLevel(ROLES.ADMIN),
    
    // Debug (Developer only)
    canViewDebugInfo: role === ROLES.DEVELOPER || role === ROLES.ADMIN,
    canAccessDebugMode: role === ROLES.DEVELOPER,
  };
};