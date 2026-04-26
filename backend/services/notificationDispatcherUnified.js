/**
 * Unified Notification Dispatcher
 *
 * Single entry point for ALL in-app notifications across Plannivo.
 * Replaces ad-hoc insertNotification() calls with a service that:
 *   1. Validates notification type
 *   2. Checks user notification preferences before sending
 *   3. Writes the notification record via notificationWriter
 *   4. Returns a result indicating whether the notification was delivered
 *
 * Usage:
 *   import { dispatchNotification, dispatchToStaff } from '../services/notificationDispatcherUnified.js';
 *
 *   await dispatchNotification({
 *     userId: '...',
 *     type: 'booking_student',
 *     title: 'Lesson booked',
 *     message: 'Your lesson on Jan 5 at 10:00',
 *     data: { bookingId, cta: { label: 'View', href: '/...' } },
 *     idempotencyKey: `booking-created:${bookingId}:student:${userId}`,
 *   });
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';
import { sendToUser as sendTelegramToUser, isTelegramEnabled } from './telegramService.js';
import { buildTelegramMessageForType } from './telegramTemplates/index.js';

// ─── Notification type registry ───────────────────────────────────────────────
// All valid notification types in the system.  When db-optimizer lands the
// notification_type_enum migration this list must stay in sync.
const NOTIFICATION_TYPES = new Set([
  // Booking lifecycle
  'booking_student',
  'booking_instructor',
  'new_booking_alert',
  'booking_confirmed',
  'booking_declined',
  'booking_checkin_student',
  'booking_completed_student',
  'booking_rescheduled',
  'booking_rescheduled_by_admin',
  'booking',                        // legacy: partner invite / accept / decline

  // Instructor-side booking notifications (NEW — Telegram integration)
  'booking_assigned',
  'booking_reassigned_instructor',
  'booking_rescheduled_instructor',
  'booking_unassigned_instructor',
  'booking_cancelled_instructor',

  // Rentals
  'rental_customer',
  'new_rental_alert',
  'rental_approved',
  'rental_declined',

  // Packages & accommodation (NEW — Phase 3)
  'package_purchase',
  'accommodation_booking',

  // Group bookings
  'group_booking_accepted',
  'group_booking_time_suggestion',
  'group_booking_payment',

  // Reschedule requests
  'reschedule_request',

  // Ratings
  'rating_request',
  'lesson_rating_instructor',

  // Shop
  'shop_order',

  // Wallet & payments
  'bank_transfer_deposit',
  'payment',

  // Instructor
  'instructor_time_off_request',

  // Waivers
  'waiver',

  // Repair requests
  'repair_update',
  'repair_comment',

  // Social / relationships
  'friend_request',
  'friend_request_accepted',

  // Quick links
  'quick_link_registration',

  // Weather
  'weather',

  // System / admin
  'general',
  'promotion',
  'announcement',
  'warning',
]);

// ─── Preference mapping ───────────────────────────────────────────────────────
// Maps notification type → notification_settings column that controls it.
// Types not listed here are ALWAYS delivered (transactional).
const PREFERENCE_MAP = {
  // Booking-related → new_booking_alerts
  booking_student:            'booking_updates',
  booking_instructor:         'new_booking_alerts',
  new_booking_alert:          'new_booking_alerts',
  booking_confirmed:          'booking_updates',
  booking_declined:           'booking_updates',
  booking_checkin_student:    'booking_updates',
  booking_completed_student:  'booking_updates',
  booking_rescheduled:        'booking_updates',
  booking_rescheduled_by_admin: 'booking_updates',
  booking:                    'booking_updates',

  // Instructor-side
  booking_assigned:               'new_booking_alerts',
  booking_reassigned_instructor:  'new_booking_alerts',
  booking_rescheduled_instructor: 'booking_updates',
  booking_unassigned_instructor:  'booking_updates',
  booking_cancelled_instructor:   'booking_updates',

  // Rentals → new_booking_alerts (same toggle as bookings for staff)
  rental_customer:            'booking_updates',
  new_rental_alert:           'new_booking_alerts',
  rental_approved:            'booking_updates',
  rental_declined:            'booking_updates',

  // Packages & accommodation → new_booking_alerts for staff
  package_purchase:           'new_booking_alerts',
  accommodation_booking:      'new_booking_alerts',

  // Group bookings — always delivered (transactional to organizer)

  // Weather
  weather:                    'weather_alerts',

  // Payments
  bank_transfer_deposit:      'payment_notifications',
  payment:                    'payment_notifications',

  // Shop
  shop_order:                 'payment_notifications',

  // General / marketing
  general:                    'general_announcements',
  promotion:                  'general_announcements',
  announcement:               'general_announcements',
};

// ─── Preference cache (per-request lifetime) ──────────────────────────────────
// Avoids repeated DB hits when dispatching many notifications for the same user
// within a single operation (e.g. notifying 5 managers about one booking).
const _prefCache = new Map();
const CACHE_TTL_MS = 10_000;

function _getCachedPref(userId) {
  const entry = _prefCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _prefCache.delete(userId);
    return undefined;
  }
  return entry.settings;
}

function _setCachedPref(userId, settings) {
  _prefCache.set(userId, { settings, ts: Date.now() });
  // Keep cache bounded
  if (_prefCache.size > 500) {
    const oldest = _prefCache.keys().next().value;
    _prefCache.delete(oldest);
  }
}

/**
 * Check whether a user has opted out of a specific notification type.
 *
 * @param {Object} executor  - pg pool or client
 * @param {string} userId    - target user UUID
 * @param {string} type      - notification type
 * @returns {boolean} true if the notification should be sent
 */
async function shouldSendToUser(executor, userId, type) {
  const column = PREFERENCE_MAP[type];
  if (!column) {
    // No preference mapping → always deliver (transactional)
    return true;
  }

  let settings = _getCachedPref(userId);
  if (settings === undefined) {
    try {
      const result = await executor.query(
        `SELECT * FROM notification_settings WHERE user_id = $1`,
        [userId]
      );
      settings = result.rows[0] || null;
      _setCachedPref(userId, settings);
    } catch (err) {
      logger.warn('Failed to check notification preferences, defaulting to send', {
        userId, type, error: err.message
      });
      return true;
    }
  }

  if (!settings) {
    // No settings row → defaults are all true
    return true;
  }

  // If the column exists and is explicitly false, suppress
  return settings[column] !== false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dispatch a single notification to one user.
 *
 * @param {Object} opts
 * @param {string}  opts.userId              - recipient UUID
 * @param {string}  opts.type                - notification type (from NOTIFICATION_TYPES)
 * @param {string}  opts.title               - notification title
 * @param {string}  opts.message             - notification body
 * @param {Object}  [opts.data={}]           - extra JSON payload (cta, bookingId, etc.)
 * @param {string}  [opts.idempotencyKey]    - dedup key
 * @param {boolean} [opts.checkPreference=true] - whether to check user settings
 * @param {Object}  [opts.client]            - pg client (for transactional use)
 * @returns {{ sent: boolean, reason?: string, id?: string }}
 */
export async function dispatchNotification({
  userId,
  type,
  title,
  message,
  data = {},
  idempotencyKey = null,
  checkPreference = true,
  client = null
} = {}) {
  if (!userId || !title || !message) {
    return { sent: false, reason: 'missing-params' };
  }

  // Type validation
  if (!NOTIFICATION_TYPES.has(type)) {
    logger.warn('Unknown notification type, sending as general', { type, userId });
    type = 'general';
  }

  const executor = client || pool;

  // Preference check
  if (checkPreference) {
    const allowed = await shouldSendToUser(executor, userId, type);
    if (!allowed) {
      return { sent: false, reason: 'user-preference-disabled' };
    }
  }

  // Write the notification
  try {
    const result = await insertNotification({
      userId,
      title,
      message,
      type,
      data,
      idempotencyKey,
      status: 'sent',
      client
    });

    if (!result.inserted) {
      return { sent: false, reason: result.reason || 'not-inserted' };
    }

    // Telegram fan-out — best effort, never blocks the in-app insert.
    deliverTelegram({ executor, userId, type, title, message, data }).catch((err) => {
      logger.warn('Telegram fan-out failed', { userId, type, error: err?.message });
    });

    return { sent: true, id: result.id };
  } catch (error) {
    logger.error('dispatchNotification failed', {
      userId, type, error: error.message
    });
    throw error;
  }
}

/**
 * Deliver a Telegram message in addition to the in-app notification.
 * Skips silently when Telegram is disabled, the user is not linked, or the
 * user has telegram_notifications=false. A failure here is logged but never
 * surfaced to the caller — the dispatch already succeeded once the in-app
 * notification was written.
 */
async function deliverTelegram({ executor, userId, type, title, message, data }) {
  if (!isTelegramEnabled()) return;

  const telegramText = buildTelegramMessageForType(type, data || {});
  if (!telegramText) return;

  // Preference check — gated on notification_settings.telegram_notifications.
  let prefAllowed = true;
  try {
    const result = await executor.query(
      `SELECT COALESCE(ns.telegram_notifications, true) AS telegram_notifications
       FROM users u
       LEFT JOIN notification_settings ns ON ns.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    if (result.rows[0]?.telegram_notifications === false) prefAllowed = false;
  } catch (err) {
    logger.warn('Failed to load Telegram preference', { userId, type, error: err.message });
    return;
  }
  if (!prefAllowed) return;

  void title;
  void message;

  // sendToUser fans out to every linked chat for this user. Failures per-chat
  // are logged inside the service and never bubble up to the caller.
  await sendTelegramToUser(userId, telegramText);
}

/**
 * Dispatch a notification to all admin/manager/owner staff who have a
 * particular alert preference enabled.
 *
 * @param {Object} opts
 * @param {string}   opts.type               - notification type
 * @param {string}   opts.title              - notification title
 * @param {string}   opts.message            - notification body
 * @param {Object}   [opts.data={}]          - extra JSON payload
 * @param {string}   [opts.idempotencyPrefix] - prefix for idempotency keys (appended with :staff:<userId>)
 * @param {string[]} [opts.excludeUserIds=[]] - user IDs to exclude (e.g. the actor who created the booking)
 * @param {string[]} [opts.roles=['admin','manager','owner']] - which staff roles to notify
 * @param {Object}   [opts.client]           - pg client for transactional use
 * @returns {{ notified: number, skipped: number }}
 */
export async function dispatchToStaff({
  type,
  title,
  message,
  data = {},
  idempotencyPrefix = null,
  excludeUserIds = [],
  roles = ['admin', 'manager', 'owner'],
  client = null
} = {}) {
  const executor = client || pool;

  // Determine which preference column controls this type
  const prefColumn = PREFERENCE_MAP[type] || 'new_booking_alerts';

  try {
    // Build exclusion placeholders
    const excludeIds = excludeUserIds.filter(Boolean);
    const excludePlaceholders = excludeIds.length
      ? `AND u.id != ALL($2::uuid[])`
      : '';
    const params = [roles];
    if (excludeIds.length) params.push(excludeIds);

    const staffQuery = await executor.query(
      `SELECT u.id, u.name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN notification_settings ns ON ns.user_id = u.id
       WHERE r.name = ANY($1)
         AND u.deleted_at IS NULL
         AND COALESCE(ns.${prefColumn}, true) = true
         ${excludePlaceholders}`,
      params
    );

    if (!staffQuery.rows.length) {
      return { notified: 0, skipped: 0 };
    }

    let notified = 0;
    let skipped = 0;

    await Promise.all(
      staffQuery.rows.map(async (staff) => {
        const key = idempotencyPrefix ? `${idempotencyPrefix}:staff:${staff.id}` : null;
        try {
          const result = await insertNotification({
            userId: staff.id,
            title,
            message,
            type,
            data,
            idempotencyKey: key,
            status: 'sent',
            client
          });
          if (result.inserted) {
            notified++;
          } else {
            skipped++;
          }
        } catch (err) {
          logger.warn('Failed to notify staff member', {
            staffId: staff.id, type, error: err.message
          });
          skipped++;
        }
      })
    );

    return { notified, skipped };
  } catch (error) {
    logger.error('dispatchToStaff failed', { type, error: error.message });
    return { notified: 0, skipped: 0 };
  }
}

/**
 * Clear the in-memory preference cache (useful in tests).
 */
export function clearPreferenceCache() {
  _prefCache.clear();
}

export { NOTIFICATION_TYPES, PREFERENCE_MAP };

export default {
  dispatchNotification,
  dispatchToStaff,
  clearPreferenceCache,
  NOTIFICATION_TYPES,
  PREFERENCE_MAP
};
