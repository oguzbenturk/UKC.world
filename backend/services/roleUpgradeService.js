/**
 * Role Upgrade Service
 * 
 * Handles automatic role upgrades based on user actions.
 * Primary use case: Upgrade outsider to student after first booking.
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Check if a user is an outsider role
 * @param {string} userId - The user ID to check
 * @returns {Promise<boolean>} - True if user is an outsider
 */
export async function isOutsiderRole(userId) {
  try {
    const result = await pool.query(`
      SELECT r.name as role_name 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [userId]);
    
    return result.rows[0]?.role_name?.toLowerCase() === 'outsider';
  } catch (error) {
    logger.error('Error checking outsider role', { userId, error: error.message });
    return false;
  }
}

/**
 * Upgrade a user from outsider to student role
 * This is called automatically after their first successful booking
 * 
 * @param {string} userId - The user ID to upgrade
 * @param {object} options - Optional parameters
 * @param {object} options.client - Database client for transaction
 * @returns {Promise<{success: boolean, newRole?: string, message: string}>}
 */
export async function upgradeOutsiderToStudent(userId, options = {}) {
  const client = options.client || pool;
  
  try {
    // First verify the user is currently an outsider
    const userCheck = await client.query(`
      SELECT u.id, u.role_id, r.name as current_role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [userId]);
    
    if (userCheck.rows.length === 0) {
      return { success: false, message: 'User not found' };
    }
    
    const currentRole = userCheck.rows[0].current_role?.toLowerCase();
    
    if (currentRole !== 'outsider') {
      // User is not an outsider, no upgrade needed
      return { 
        success: true, 
        newRole: currentRole, 
        message: `User already has ${currentRole} role, no upgrade needed` 
      };
    }
    
    // Get the student role ID
    const studentRoleResult = await client.query(`
      SELECT id FROM roles WHERE name = 'student'
    `);
    
    if (studentRoleResult.rows.length === 0) {
      logger.error('Student role not found in database');
      return { success: false, message: 'Student role not configured in system' };
    }
    
    const studentRoleId = studentRoleResult.rows[0].id;
    
    // Upgrade the user to student
    await client.query(`
      UPDATE users 
      SET role_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [studentRoleId, userId]);
    
    logger.info('User upgraded from outsider to student', { 
      userId, 
      previousRole: 'outsider', 
      newRole: 'student' 
    });
    
    return { 
      success: true, 
      newRole: 'student', 
      message: 'Successfully upgraded to student role' 
    };
    
  } catch (error) {
    logger.error('Error upgrading user role', { 
      userId, 
      error: error.message,
      stack: error.stack 
    });
    return { success: false, message: 'Failed to upgrade role' };
  }
}

/**
 * Check if user should be upgraded after booking and perform upgrade
 * This is the main entry point called after booking creation
 * 
 * @param {string} userId - The user ID who made the booking
 * @param {object} options - Optional parameters
 * @param {object} options.client - Database client for transaction
 * @returns {Promise<{upgraded: boolean, newRole?: string}>}
 */
export async function checkAndUpgradeAfterBooking(userId, options = {}) {
  try {
    const isOutsider = await isOutsiderRole(userId);
    
    if (!isOutsider) {
      return { upgraded: false };
    }
    
    const result = await upgradeOutsiderToStudent(userId, options);
    
    return { 
      upgraded: result.success && result.newRole === 'student',
      newRole: result.newRole
    };
    
  } catch (error) {
    logger.error('Error in checkAndUpgradeAfterBooking', { 
      userId, 
      error: error.message 
    });
    return { upgraded: false };
  }
}

export default {
  isOutsiderRole,
  upgradeOutsiderToStudent,
  checkAndUpgradeAfterBooking
};
