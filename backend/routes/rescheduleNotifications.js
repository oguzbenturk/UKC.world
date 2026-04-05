import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * GET /api/reschedule-notifications/pending
 * Get all pending reschedule notifications for the current student
 */
router.get('/pending', authorizeRoles(['student', 'outsider', 'instructor', 'admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        rn.*,
        b.date AS current_booking_date,
        b.start_hour AS current_booking_start_hour,
        b.status AS booking_status,
        s.name AS service_name_live,
        changer.name AS changed_by_name
      FROM booking_reschedule_notifications rn
      JOIN bookings b ON b.id = rn.booking_id
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN users changer ON changer.id = rn.changed_by
      WHERE rn.student_user_id = $1
        AND rn.status = 'pending'
      ORDER BY rn.created_at DESC
    `, [req.user.id]);

    res.json({ rescheduleNotifications: result.rows });
  } catch (error) {
    logger.error('Failed to fetch pending reschedule notifications', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch reschedule notifications' });
  }
});

/**
 * PATCH /api/reschedule-notifications/:id/confirm
 * Student confirms they've seen the reschedule
 */
router.patch('/:id/confirm', authorizeRoles(['student', 'outsider', 'instructor', 'admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE booking_reschedule_notifications
      SET status = 'confirmed',
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND student_user_id = $2
        AND status = 'pending'
      RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found or already processed' });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    logger.error('Failed to confirm reschedule notification', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to confirm notification' });
  }
});

/**
 * PATCH /api/reschedule-notifications/:id/dismiss
 * Student dismisses the reschedule notification
 */
router.patch('/:id/dismiss', authorizeRoles(['student', 'outsider', 'instructor', 'admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE booking_reschedule_notifications
      SET status = 'dismissed',
          updated_at = NOW()
      WHERE id = $1
        AND student_user_id = $2
        AND status = 'pending'
      RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found or already processed' });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    logger.error('Failed to dismiss reschedule notification', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

/**
 * POST /api/reschedule-notifications/confirm-all
 * Student confirms all pending reschedule notifications at once
 */
router.post('/confirm-all', authorizeRoles(['student', 'outsider', 'instructor', 'admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE booking_reschedule_notifications
      SET status = 'confirmed',
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE student_user_id = $1
        AND status = 'pending'
      RETURNING id
    `, [req.user.id]);

    res.json({ success: true, confirmedCount: result.rowCount });
  } catch (error) {
    logger.error('Failed to confirm all reschedule notifications', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to confirm notifications' });
  }
});

export default router;
