/**
 * Marketing Consent Service
 * 
 * CRITICAL: This service enforces user marketing preferences for GDPR compliance.
 * 
 * Communication Types:
 * - TRANSACTIONAL: Always allowed (password reset, booking confirmations, payment receipts, security alerts)
 * - MARKETING: Requires explicit opt-in (promotions, newsletters, offers, general updates)
 * 
 * Channels:
 * - email: Requires marketing_email_opt_in
 * - sms: Requires marketing_sms_opt_in
 * - whatsapp: Requires marketing_whatsapp_opt_in
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

// Communication types
export const COMMUNICATION_TYPE = {
  TRANSACTIONAL: 'transactional',
  MARKETING: 'marketing'
};

// Channels
export const CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  IN_APP: 'in_app', // In-app notifications are always allowed
  PUSH: 'push'
};

// Transactional notification types that bypass consent (always allowed)
const TRANSACTIONAL_TYPES = new Set([
  // Account & Security
  'password_reset',
  'password_changed',
  'account_locked',
  'account_security',
  'login_alert',
  'email_verification',
  'account_created',
  
  // Booking Operations (direct customer transactions)
  'booking_confirmation',
  'booking_created',
  'booking_cancelled',
  'booking_rescheduled',
  'booking_reminder', // Reminders for their own bookings
  'lesson_completed',
  'lesson_upcoming',
  
  // Payments (financial transactions)
  'payment_received',
  'payment_failed',
  'payment_refunded',
  'invoice_created',
  'receipt',
  'wallet_deposit',
  'wallet_withdrawal',
  
  // Waiver & Legal
  'waiver_required',
  'waiver_expiring',
  'waiver_signed',
  'terms_updated',
  
  // Instructor-specific (job-related)
  'instructor_assigned',
  'instructor_rating',
  'schedule_change',
  
  // Support
  'support_ticket_response',
  'support_ticket_created'
]);

// Marketing notification types that require consent
const MARKETING_TYPES = new Set([
  'promotion',
  'newsletter',
  'special_offer',
  'discount_code',
  'new_service',
  'event_announcement',
  'seasonal_offer',
  'birthday_offer',
  'loyalty_reward',
  'referral_program',
  'survey_request',
  'feedback_request',
  'general_update',
  'marketing',
  'announcement',
  'bulk_notification'
]);

/**
 * Determine if a notification type is transactional or marketing
 * @param {string} notificationType - The type of notification
 * @returns {'transactional' | 'marketing'}
 */
export function classifyNotification(notificationType) {
  if (!notificationType) {
    // Default to marketing (requires consent) for safety
    return COMMUNICATION_TYPE.MARKETING;
  }

  const normalized = notificationType.toLowerCase().replace(/[-\s]/g, '_');

  if (TRANSACTIONAL_TYPES.has(normalized)) {
    return COMMUNICATION_TYPE.TRANSACTIONAL;
  }

  if (MARKETING_TYPES.has(normalized)) {
    return COMMUNICATION_TYPE.MARKETING;
  }

  // Check for partial matches
  if (normalized.includes('password') || 
      normalized.includes('security') || 
      normalized.includes('payment') ||
      normalized.includes('booking') ||
      normalized.includes('invoice') ||
      normalized.includes('receipt') ||
      normalized.includes('waiver')) {
    return COMMUNICATION_TYPE.TRANSACTIONAL;
  }

  if (normalized.includes('promo') || 
      normalized.includes('offer') || 
      normalized.includes('newsletter') ||
      normalized.includes('marketing') ||
      normalized.includes('campaign')) {
    return COMMUNICATION_TYPE.MARKETING;
  }

  // Default to marketing for unknown types (safer for compliance)
  logger.warn('Unknown notification type, defaulting to marketing classification', { notificationType });
  return COMMUNICATION_TYPE.MARKETING;
}

/**
 * Get user's marketing consent preferences
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Consent preferences
 */
export async function getUserMarketingConsent(userId) {
  if (!userId) {
    return {
      email: false,
      sms: false,
      whatsapp: false,
      inApp: true, // In-app always allowed
      hasRecord: false
    };
  }

  try {
    const result = await pool.query(`
      SELECT marketing_email_opt_in, marketing_sms_opt_in, marketing_whatsapp_opt_in
      FROM user_consents
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      // No consent record = no marketing allowed (opt-in model)
      return {
        email: false,
        sms: false,
        whatsapp: false,
        inApp: true,
        hasRecord: false
      };
    }

    const row = result.rows[0];
    return {
      email: row.marketing_email_opt_in === true,
      sms: row.marketing_sms_opt_in === true,
      whatsapp: row.marketing_whatsapp_opt_in === true,
      inApp: true,
      hasRecord: true
    };
  } catch (error) {
    logger.error('Failed to fetch user marketing consent', { userId, error: error.message });
    // On error, deny marketing (fail-safe for compliance)
    return {
      email: false,
      sms: false,
      whatsapp: false,
      inApp: true,
      hasRecord: false,
      error: true
    };
  }
}

/**
 * Check if a specific communication can be sent to a user
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.channel - Communication channel (email, sms, whatsapp, in_app)
 * @param {string} params.notificationType - Type of notification
 * @param {boolean} params.forceTransactional - Force treat as transactional (use carefully)
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export async function canSendCommunication({ userId, channel, notificationType, forceTransactional = false }) {
  // In-app notifications are always allowed
  if (channel === CHANNEL.IN_APP) {
    return { allowed: true, reason: 'In-app notifications always allowed' };
  }

  // Classify the notification
  const classification = forceTransactional 
    ? COMMUNICATION_TYPE.TRANSACTIONAL 
    : classifyNotification(notificationType);

  // Transactional notifications are always allowed
  if (classification === COMMUNICATION_TYPE.TRANSACTIONAL) {
    return { 
      allowed: true, 
      reason: `Transactional notification (${notificationType}) - consent not required` 
    };
  }

  // Marketing notifications require consent check
  const consent = await getUserMarketingConsent(userId);

  const channelMap = {
    [CHANNEL.EMAIL]: consent.email,
    [CHANNEL.SMS]: consent.sms,
    [CHANNEL.WHATSAPP]: consent.whatsapp,
    [CHANNEL.PUSH]: consent.email // Push follows email preference
  };

  const hasConsent = channelMap[channel] ?? false;

  if (hasConsent) {
    return { 
      allowed: true, 
      reason: `User opted in to ${channel} marketing communications` 
    };
  }

  // Log blocked communication for audit
  logger.info('Marketing communication blocked due to missing consent', {
    userId,
    channel,
    notificationType,
    hasConsentRecord: consent.hasRecord
  });

  return { 
    allowed: false, 
    reason: consent.hasRecord 
      ? `User has not opted in to ${channel} marketing` 
      : `No consent record found for user - marketing communications blocked`
  };
}

/**
 * Filter a list of user IDs to only those who have consented to a channel
 * Useful for bulk marketing campaigns
 * @param {string[]} userIds - Array of user IDs
 * @param {string} channel - Communication channel
 * @param {string} notificationType - Type of notification
 * @returns {Promise<{allowed: string[], blocked: string[]}>}
 */
export async function filterUsersByConsent(userIds, channel, notificationType) {
  if (!userIds || userIds.length === 0) {
    return { allowed: [], blocked: [] };
  }

  const classification = classifyNotification(notificationType);

  // Transactional - all users allowed
  if (classification === COMMUNICATION_TYPE.TRANSACTIONAL) {
    return { allowed: userIds, blocked: [] };
  }

  // In-app - all users allowed
  if (channel === CHANNEL.IN_APP) {
    return { allowed: userIds, blocked: [] };
  }

  // Marketing - check consent
  const columnMap = {
    [CHANNEL.EMAIL]: 'marketing_email_opt_in',
    [CHANNEL.SMS]: 'marketing_sms_opt_in',
    [CHANNEL.WHATSAPP]: 'marketing_whatsapp_opt_in',
    [CHANNEL.PUSH]: 'marketing_email_opt_in'
  };

  const consentColumn = columnMap[channel];
  if (!consentColumn) {
    logger.warn('Unknown channel for consent filtering', { channel });
    return { allowed: [], blocked: userIds };
  }

  try {
    const result = await pool.query(`
      SELECT user_id
      FROM user_consents
      WHERE user_id = ANY($1)
        AND ${consentColumn} = true
    `, [userIds]);

    const allowedSet = new Set(result.rows.map(r => r.user_id));
    const allowed = userIds.filter(id => allowedSet.has(id));
    const blocked = userIds.filter(id => !allowedSet.has(id));

    logger.info('Bulk consent filter applied', {
      channel,
      notificationType,
      totalUsers: userIds.length,
      allowedCount: allowed.length,
      blockedCount: blocked.length
    });

    return { allowed, blocked };
  } catch (error) {
    logger.error('Failed to filter users by consent', { error: error.message });
    // Fail-safe: block all for marketing
    return { allowed: [], blocked: userIds };
  }
}

/**
 * Record that a marketing communication was sent (for audit trail)
 * @param {Object} params
 */
export async function recordMarketingCommunication({ userId, channel, notificationType, messageId }) {
  // This could be extended to store in a separate audit table if needed
  logger.info('Marketing communication sent', {
    userId,
    channel,
    notificationType,
    messageId,
    timestamp: new Date().toISOString()
  });
}

export default {
  COMMUNICATION_TYPE,
  CHANNEL,
  classifyNotification,
  getUserMarketingConsent,
  canSendCommunication,
  filterUsersByConsent,
  recordMarketingCommunication
};
