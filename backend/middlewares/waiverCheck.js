/**
 * Waiver Check Middleware
 * 
 * Enforces liability waiver completion before booking/rental operations
 * 
 * Middleware Functions:
 * - requireWaiver: Blocks booking/rental creation if waiver not signed
 * - checkFamilyMemberWaiver: Validates family member waivers on bookings
 */

import * as waiverService from '../services/waiverService.js';

const BYPASS_ROLES = new Set(['admin', 'manager', 'owner']);

/**
 * Middleware to require valid liability waiver before booking/rental
 * Checks if the user has signed a valid, non-expired waiver
 * 
 * Usage:
 *   router.post('/bookings', authenticateJWT, requireWaiver, createBooking);
 */
export async function requireWaiver(req, res, next) {
  try {
    const userId = req.user.id;
    const rawRole = req.user.role;
    const userRole = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;

    if (userRole && BYPASS_ROLES.has(userRole)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`requireWaiver: bypassing waiver check for role ${userRole}`);
      }
      return next();
    }

    if (!userRole && process.env.NODE_ENV !== 'production') {
      console.warn('requireWaiver: missing role on req.user, continuing with waiver enforcement');
    }

    // Check if user needs to sign waiver
    const needsWaiver = await waiverService.needsToSignWaiver(userId, 'user');

    if (needsWaiver) {
      return res.status(403).json({
        success: false,
        code: 'WAIVER_REQUIRED',
        message: 'You must sign the liability waiver before making a booking or rental.',
        action: {
          type: 'SIGN_WAIVER',
          url: '/profile/waiver',
          description: 'Please review and sign the liability waiver to continue.',
        },
      });
    }

    // Waiver is valid, proceed to next middleware/route
    next();
  } catch (error) {
    console.error('Error checking waiver requirement:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify waiver status',
      error: error.message,
    });
  }
}

/**
 * Middleware to validate family member waiver on bookings/rentals
 * Checks if family_member_id is provided and ensures they have a valid waiver
 * 
 * Usage:
 *   router.post('/bookings', authenticateJWT, requireWaiver, checkFamilyMemberWaiver, createBooking);
 */
export async function checkFamilyMemberWaiver(req, res, next) {
  try {
    const { family_member_id } = req.body;

    // Skip check if no family member involved
    if (!family_member_id) {
      return next();
    }

    // Verify family member belongs to the authenticated user
    const userId = req.user.id;
    const rawRole = req.user.role;
    const userRole = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;

    // Admins can skip ownership check
    if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'owner') {
      const pool = (await import('../db.js')).default;
      const familyCheck = await pool.query(
        `SELECT parent_user_id FROM family_members WHERE id = $1 AND deleted_at IS NULL`,
        [family_member_id]
      );

      if (familyCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Family member not found',
        });
      }

      if (familyCheck.rows[0].parent_user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only make bookings for your own family members',
        });
      }
    }

    // Check if family member needs to sign waiver
    const needsWaiver = await waiverService.needsToSignWaiver(family_member_id, 'family_member');

    if (needsWaiver) {
      return res.status(403).json({
        success: false,
        code: 'FAMILY_WAIVER_REQUIRED',
        message: 'Your family member must have a signed liability waiver before making a booking or rental.',
        action: {
          type: 'SIGN_FAMILY_WAIVER',
          url: `/profile/family/${family_member_id}/waiver`,
          description: 'Please sign the liability waiver on behalf of your family member.',
        },
      });
    }

    // Family member waiver is valid, proceed
    next();
  } catch (error) {
    console.error('Error checking family member waiver:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify family member waiver status',
      error: error.message,
    });
  }
}

/**
 * Optional: Soft waiver check (warns but doesn't block)
 * Use this for non-critical operations where you want to encourage waiver signing
 * but don't want to block the user
 */
export async function warnIfNoWaiver(req, res, next) {
  try {
    const userId = req.user.id;
    const needsWaiver = await waiverService.needsToSignWaiver(userId, 'user');

    if (needsWaiver) {
      // Attach warning to response (can be picked up by frontend)
      req.waiverWarning = {
        code: 'WAIVER_RECOMMENDED',
        message: 'We recommend signing the liability waiver for full access to all features.',
        action: {
          type: 'SIGN_WAIVER',
          url: '/profile/waiver',
        },
      };
    }

    next();
  } catch (error) {
    // Don't block request on soft check error
    console.error('Error in soft waiver check:', error);
    next();
  }
}

/**
 * Helper: Attach waiver warning to response if it exists
 * Use this in your route handler after warnIfNoWaiver middleware
 * 
 * Example:
 *   const response = { success: true, data: bookings };
 *   attachWaiverWarning(req, response);
 *   res.json(response);
 */
export function attachWaiverWarning(req, responseObject) {
  if (req.waiverWarning) {
    responseObject.warning = req.waiverWarning;
  }
  return responseObject;
}

/**
 * Middleware factory: Create waiver check with custom expiry days
 * Allows configuring waiver validity period per route
 * 
 * Usage:
 *   router.post('/extreme-sports', authenticateJWT, requireWaiverWithExpiry(90), handler);
 */
export function requireWaiverWithExpiry(expiryDays = 365) {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Get waiver status with custom expiry check
      const status = await waiverService.checkWaiverStatus(userId, 'user');

      if (!status.hasSigned) {
        return res.status(403).json({
          success: false,
          code: 'WAIVER_REQUIRED',
          message: 'You must sign the liability waiver before proceeding.',
          action: {
            type: 'SIGN_WAIVER',
            url: '/profile/waiver',
          },
        });
      }

      // Check custom expiry
      if (status.daysSinceSigned > expiryDays) {
        return res.status(403).json({
          success: false,
          code: 'WAIVER_EXPIRED',
          message: `Your waiver has expired (valid for ${expiryDays} days). Please sign a new one.`,
          action: {
            type: 'SIGN_WAIVER',
            url: '/profile/waiver',
          },
        });
      }

      // Check version
      if (status.needsNewVersion) {
        return res.status(403).json({
          success: false,
          code: 'WAIVER_VERSION_OUTDATED',
          message: 'A new waiver version is available. Please review and sign the updated waiver.',
          action: {
            type: 'SIGN_WAIVER',
            url: '/profile/waiver',
          },
        });
      }

      next();
    } catch (error) {
      console.error('Error checking waiver with custom expiry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify waiver status',
        error: error.message,
      });
    }
  };
}

export default {
  requireWaiver,
  checkFamilyMemberWaiver,
  warnIfNoWaiver,
  attachWaiverWarning,
  requireWaiverWithExpiry,
};
