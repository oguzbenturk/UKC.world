import express from 'express';
import { body, validationResult } from 'express-validator';
import { authorizeRoles as authorize } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from '../services/notificationWriter.js';
import { filterUsersByConsent, classifyNotification, CHANNEL, COMMUNICATION_TYPE } from '../services/marketingConsentService.js';

const router = express.Router();

// All notification endpoints require authentication
router.use(authenticateJWT);

const formatNotification = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  message: row.message,
  type: row.type || 'general',
  status: row.status || (row.read_at ? 'read' : 'sent'),
  data: typeof row.data === 'object' && row.data !== null ? row.data : (() => {
    try {
      return row.data ? JSON.parse(row.data) : {};
    } catch (error) {
      logger.warn('Failed to parse notification data JSON', { id: row.id, error: error.message });
      return {};
    }
  })(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  readAt: row.read_at
});

// Subscribe to push notifications
router.post('/subscribe', 
  authorize(['admin', 'manager', 'instructor', 'student', 'outsider']),
  [
    body('endpoint').notEmpty().withMessage('Endpoint is required'),
    body('keys.p256dh').notEmpty().withMessage('P256DH key is required'),
    body('keys.auth').notEmpty().withMessage('Auth key is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { endpoint, keys } = req.body;
      const userId = req.user.id;

      // Store subscription in database
      await pool.query(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, endpoint) 
        DO UPDATE SET 
          p256dh_key = EXCLUDED.p256dh_key,
          auth_key = EXCLUDED.auth_key,
          updated_at = NOW()
      `, [userId, endpoint, keys.p256dh, keys.auth]);

      res.json({ success: true });

    } catch (error) {
      logger.error('Error subscribing to push notifications:', error);
      res.status(500).json({ error: 'Failed to subscribe to notifications' });
    }
  }
);

// Unsubscribe from push notifications
router.post('/unsubscribe', 
  authorize(['admin', 'manager', 'instructor', 'student', 'outsider']),
  [
    body('endpoint').notEmpty().withMessage('Endpoint is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { endpoint } = req.body;
      const userId = req.user.id;

      await pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [userId, endpoint]
      );

      res.json({ success: true });

    } catch (error) {
      logger.error('Error unsubscribing from push notifications:', error);
      res.status(500).json({ error: 'Failed to unsubscribe from notifications' });
    }
  }
);

// Send notification (admin/manager only)
// IMPORTANT: For marketing notifications, only users who have opted-in will receive them
router.post('/send', 
  authorize(['admin', 'manager']),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('recipients').optional().isArray().withMessage('Recipients must be an array'),
    body('type').optional().isIn(['weather', 'booking', 'general', 'promotion', 'announcement']).withMessage('Invalid notification type'),
    body('isMarketing').optional().isBoolean().withMessage('isMarketing must be a boolean')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, message, recipients, type = 'general', data = {}, isMarketing } = req.body;

      // Determine if this is a marketing notification
      const notificationClass = isMarketing === true 
        ? COMMUNICATION_TYPE.MARKETING 
        : classifyNotification(type);
      const isMarketingNotification = notificationClass === COMMUNICATION_TYPE.MARKETING;

      let targetUserIds;
      
      if (recipients && recipients.length > 0) {
        targetUserIds = recipients;
      } else {
        // Get all users with push subscriptions
        const result = await pool.query('SELECT DISTINCT user_id FROM push_subscriptions');
        targetUserIds = result.rows.map(r => r.user_id);
      }

      // CONSENT CHECK: Filter users based on marketing consent if this is a marketing notification
      let allowedUserIds = targetUserIds;
      let blockedCount = 0;

      if (isMarketingNotification && targetUserIds.length > 0) {
        const consentFilter = await filterUsersByConsent(targetUserIds, CHANNEL.IN_APP, type);
        allowedUserIds = consentFilter.allowed;
        blockedCount = consentFilter.blocked.length;

        logger.info('Marketing notification consent filter applied', {
          type,
          totalTargeted: targetUserIds.length,
          allowedCount: allowedUserIds.length,
          blockedCount,
          sentBy: req.user.id
        });
      }

      // Get subscriptions only for allowed users
      let subscriptions = [];
      if (allowedUserIds.length > 0) {
        const result = await pool.query(
          'SELECT * FROM push_subscriptions WHERE user_id = ANY($1)',
          [allowedUserIds]
        );
        subscriptions = result.rows;
      }

      // Store the notifications in the database
      const notifications = await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            const result = await insertNotification({
              userId: subscription.user_id,
              title,
              message,
              type,
              data: { ...data, isMarketing: isMarketingNotification },
              status: 'sent'
            });

            return result.inserted ? { id: result.id, user_id: subscription.user_id } : null;
          } catch (error) {
            logger.error(`Error storing notification for user ${subscription.user_id}:`, error);
            return null;
          }
        })
      );

      const successCount = notifications.filter(n => n !== null).length;

      res.json({ 
        success: true, 
        sent: successCount,
        total: targetUserIds.length,
        blockedByConsent: blockedCount,
        isMarketing: isMarketingNotification,
        message: blockedCount > 0 
          ? `${successCount} notifications sent. ${blockedCount} users blocked due to marketing preferences.`
          : `${successCount} notifications sent successfully.`
      });

    } catch (error) {
      logger.error('Error sending notifications:', error);
      res.status(500).json({ error: 'Failed to send notifications' });
    }
  }
);

// Get user notifications
router.get('/user', authorize(['admin', 'manager', 'instructor', 'student', 'outsider']), async (req, res) => {
  try {
    const userId = req.user.id;
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (parsedPage - 1) * parsedLimit;

    const baseParams = [userId];
    const filters = [];

    if (unreadOnly === 'true') {
      filters.push('read_at IS NULL');
    }

    const whereClause = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const query = `
      SELECT *
        FROM notifications
       WHERE user_id = $1
       ${whereClause}
    ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`;

  const result = await pool.query(query, [...baseParams, parsedLimit, offset]);

    const totalQuery = `SELECT COUNT(*) FROM notifications WHERE user_id = $1 ${filters.length ? `AND ${filters.join(' AND ')}` : ''}`;
    const totalResult = await pool.query(totalQuery, baseParams);
  const total = parseInt(totalResult.rows[0].count, 10) || 0;

    const unreadResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      baseParams
    );
    const unreadCount = parseInt(unreadResult.rows[0].count, 10) || 0;

    res.json({
      notifications: result.rows.map(formatNotification),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.max(Math.ceil(total / parsedLimit), 1)
      },
      meta: {
        unreadCount,
        totalCount: total
      }
    });

  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', authorize(['admin', 'manager', 'instructor', 'student', 'outsider']), async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(`
      UPDATE notifications 
      SET read_at = NOW() 
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING *
    `, [notificationId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found or already read' });
    }

    res.json(formatNotification(result.rows[0]));

  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/read-all', authorize(['admin', 'manager', 'instructor', 'student', 'outsider']), async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      UPDATE notifications 
      SET read_at = NOW() 
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING id
    `, [userId]);

    res.json({ 
      success: true, 
      updatedCount: result.rowCount 
    });

  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Clear all notifications (delete them)
router.delete('/clear-all', authorize(['admin', 'manager', 'instructor', 'student', 'outsider']), async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      DELETE FROM notifications 
      WHERE user_id = $1
      RETURNING id
    `, [userId]);

    res.json({ 
      success: true, 
      deletedCount: result.rowCount 
    });

  } catch (error) {
    logger.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Get notification settings
router.get('/settings', authorize(['admin', 'manager', 'instructor', 'student', 'outsider']), async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM notification_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default settings
      res.json({
        weather_alerts: true,
        booking_updates: true,
        payment_notifications: true,
        general_announcements: true,
        email_notifications: true,
        push_notifications: true,
        new_booking_alerts: true
      });
    } else {
      const settings = result.rows[0];
      // Ensure new_booking_alerts defaults to true if not set
      res.json({
        ...settings,
        new_booking_alerts: settings.new_booking_alerts ?? true
      });
    }

  } catch (error) {
    logger.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// Update notification settings
router.put('/settings', 
  authorize(['admin', 'manager', 'instructor', 'student', 'outsider']),
  [
    body('weather_alerts').optional().isBoolean(),
    body('booking_updates').optional().isBoolean(),
    body('payment_notifications').optional().isBoolean(),
    body('general_announcements').optional().isBoolean(),
    body('email_notifications').optional().isBoolean(),
    body('push_notifications').optional().isBoolean(),
    body('new_booking_alerts').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const settings = req.body;

      const result = await pool.query(`
        INSERT INTO notification_settings (
          user_id, 
          weather_alerts, 
          booking_updates, 
          payment_notifications, 
          general_announcements, 
          email_notifications, 
          push_notifications,
          new_booking_alerts,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          weather_alerts = EXCLUDED.weather_alerts,
          booking_updates = EXCLUDED.booking_updates,
          payment_notifications = EXCLUDED.payment_notifications,
          general_announcements = EXCLUDED.general_announcements,
          email_notifications = EXCLUDED.email_notifications,
          push_notifications = EXCLUDED.push_notifications,
          new_booking_alerts = EXCLUDED.new_booking_alerts,
          updated_at = NOW()
        RETURNING *
      `, [
        userId,
        settings.weather_alerts ?? true,
        settings.booking_updates ?? true,
        settings.payment_notifications ?? true,
        settings.general_announcements ?? true,
        settings.email_notifications ?? true,
        settings.push_notifications ?? true,
        settings.new_booking_alerts ?? true
      ]);

      res.json(result.rows[0]);

    } catch (error) {
      logger.error('Error updating notification settings:', error);
      res.status(500).json({ error: 'Failed to update notification settings' });
    }
  }
);

export default router;
