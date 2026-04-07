import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { insertNotification } from '../services/notificationWriter.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Expand a start_date/end_date range into an array of 'YYYY-MM-DD' strings.
 */
function expandDateRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// ── Instructor self-service: /me/availability ─────────────────────────────

// GET /instructors/me/availability — list own entries
router.get(
  '/me/availability',
  authenticateJWT,
  authorizeRoles(['instructor', 'manager', 'admin']),
  async (req, res) => {
    try {
      const { status, from } = req.query;
      let query = `
        SELECT ia.*,
               cb.name AS created_by_name,
               rb.name AS reviewed_by_name
        FROM instructor_availability ia
        LEFT JOIN users cb ON cb.id = ia.created_by
        LEFT JOIN users rb ON rb.id = ia.reviewed_by
        WHERE ia.instructor_id = $1
      `;
      const params = [req.user.id];

      if (status) {
        params.push(status);
        query += ` AND ia.status = $${params.length}`;
      }
      if (from) {
        params.push(from);
        query += ` AND ia.end_date >= $${params.length}`;
      }
      query += ' ORDER BY ia.start_date DESC';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      logger.error('Error fetching own availability:', err);
      res.status(500).json({ error: 'Failed to fetch availability' });
    }
  }
);

// POST /instructors/me/availability — request time off (creates as 'pending')
router.post(
  '/me/availability',
  authenticateJWT,
  authorizeRoles(['instructor', 'manager', 'admin']),
  async (req, res) => {
    try {
      const { start_date, end_date, type = 'off_day', reason } = req.body;
      if (!start_date || !end_date) {
        return res.status(400).json({ error: 'start_date and end_date are required' });
      }
      if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ error: 'end_date must be >= start_date' });
      }

      // Check for overlap with existing non-cancelled entries
      const overlapCheck = await pool.query(
        `SELECT id FROM instructor_availability
         WHERE instructor_id = $1
           AND status NOT IN ('cancelled', 'rejected')
           AND start_date <= $3 AND end_date >= $2`,
        [req.user.id, start_date, end_date]
      );
      if (overlapCheck.rows.length > 0) {
        return res.status(409).json({ error: 'This date range overlaps with an existing request' });
      }

      const { rows } = await pool.query(
        `INSERT INTO instructor_availability
           (instructor_id, start_date, end_date, type, status, reason, created_by)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         RETURNING *`,
        [req.user.id, start_date, end_date, type, reason || null, req.user.id]
      );
      const entry = rows[0];
      res.status(201).json(entry);

      // Notify all admins and managers (fire-and-forget, non-blocking)
      try {
        const instructorResult = await pool.query(
          'SELECT name, first_name FROM users WHERE id = $1',
          [req.user.id]
        );
        const instructorName = instructorResult.rows[0]
          ? (instructorResult.rows[0].name || `${instructorResult.rows[0].first_name || ''}`.trim() || 'An instructor')
          : 'An instructor';

        const TYPE_LABELS = {
          off_day: 'Off Day', vacation: 'Vacation',
          sick_leave: 'Sick Leave', custom: 'Custom',
        };
        const typeLabel = TYPE_LABELS[type] || type;
        const dateRange = start_date === end_date
          ? start_date
          : `${start_date} → ${end_date}`;

        const adminManagers = await pool.query(
          `SELECT u.id FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE r.name IN ('admin', 'manager') AND u.deleted_at IS NULL`
        );

        for (const recipient of adminManagers.rows) {
          await insertNotification({
            userId: recipient.id,
            title: 'Time-Off Request',
            message: `${instructorName} requested ${typeLabel} (${dateRange})${reason ? ': ' + reason : ''}.`,
            type: 'instructor_time_off_request',
            data: {
              instructorId: req.user.id,
              instructorName,
              availabilityEntryId: entry.id,
              startDate: start_date,
              endDate: end_date,
              entryType: type,
              reason: reason || null,
              cta: {
                label: 'Review Request',
                href: `/instructors?open=${req.user.id}&tab=availability`,
              },
            },
          });
        }
      } catch (notifErr) {
        logger.error('Error sending time-off notifications:', notifErr);
      }
    } catch (err) {
      logger.error('Error creating availability request:', err);
      res.status(500).json({ error: 'Failed to create availability request' });
    }
  }
);

// DELETE /instructors/me/availability/:id — cancel own pending request
router.delete(
  '/me/availability/:id',
  authenticateJWT,
  authorizeRoles(['instructor', 'manager', 'admin']),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM instructor_availability WHERE id = $1',
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Availability entry not found' });
      }
      const entry = rows[0];

      // Only owners can cancel their own (admins can use the /:instructorId route)
      if (entry.instructor_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ error: 'Forbidden: You can only cancel your own requests' });
      }
      if (entry.status === 'approved') {
        return res.status(400).json({ error: 'Cannot cancel an already-approved entry. Contact an admin.' });
      }
      if (entry.status === 'cancelled') {
        return res.status(400).json({ error: 'Entry is already cancelled' });
      }

      const { rows: updated } = await pool.query(
        `UPDATE instructor_availability SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      res.json(updated[0]);
    } catch (err) {
      logger.error('Error cancelling availability entry:', err);
      res.status(500).json({ error: 'Failed to cancel availability entry' });
    }
  }
);

// ── Batch query for calendar / booking forms ──────────────────────────────

// GET /instructors/unavailable?startDate=&endDate=
// Returns: { instructorId: ['YYYY-MM-DD', ...], ... }
router.get(
  '/unavailable',
  authenticateJWT,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const { rows } = await pool.query(
        `SELECT instructor_id::text, start_date::text, end_date::text
         FROM instructor_availability
         WHERE status = 'approved'
           AND start_date <= $2::date AND end_date >= $1::date`,
        [startDate, endDate]
      );

      // Build map: instructorId → Set of blocked dates within the query window
      const map = {};
      for (const row of rows) {
        const dates = expandDateRange(
          row.start_date > startDate ? row.start_date : startDate,
          row.end_date < endDate ? row.end_date : endDate
        );
        if (!map[row.instructor_id]) map[row.instructor_id] = [];
        for (const d of dates) {
          if (!map[row.instructor_id].includes(d)) {
            map[row.instructor_id].push(d);
          }
        }
      }

      res.json(map);
    } catch (err) {
      logger.error('Error fetching unavailable instructors:', err);
      res.status(500).json({ error: 'Failed to fetch unavailable instructors' });
    }
  }
);

// ── Admin / manager management: /:instructorId/availability ──────────────

// GET /instructors/:instructorId/availability
router.get(
  '/:instructorId/availability',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
    try {
      const { status, from } = req.query;
      let query = `
        SELECT ia.*,
               cb.name AS created_by_name,
               rb.name AS reviewed_by_name
        FROM instructor_availability ia
        LEFT JOIN users cb ON cb.id = ia.created_by
        LEFT JOIN users rb ON rb.id = ia.reviewed_by
        WHERE ia.instructor_id = $1
      `;
      const params = [req.params.instructorId];

      if (status) {
        params.push(status);
        query += ` AND ia.status = $${params.length}`;
      }
      if (from) {
        params.push(from);
        query += ` AND ia.end_date >= $${params.length}`;
      }
      query += ' ORDER BY ia.start_date DESC';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      logger.error('Error fetching instructor availability (admin):', err);
      res.status(500).json({ error: 'Failed to fetch availability' });
    }
  }
);

// POST /instructors/:instructorId/availability — admin creates block (auto-approved)
router.post(
  '/:instructorId/availability',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
    try {
      const { start_date, end_date, type = 'off_day', reason } = req.body;
      if (!start_date || !end_date) {
        return res.status(400).json({ error: 'start_date and end_date are required' });
      }
      if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ error: 'end_date must be >= start_date' });
      }

      // Check instructor exists
      const instructorCheck = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name IN ('instructor', 'manager')) AND deleted_at IS NULL`,
        [req.params.instructorId]
      );
      if (instructorCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Instructor not found' });
      }

      // Check for overlap
      const overlapCheck = await pool.query(
        `SELECT id FROM instructor_availability
         WHERE instructor_id = $1
           AND status NOT IN ('cancelled', 'rejected')
           AND start_date <= $3 AND end_date >= $2`,
        [req.params.instructorId, start_date, end_date]
      );
      if (overlapCheck.rows.length > 0) {
        return res.status(409).json({ error: 'This date range overlaps with an existing entry' });
      }

      const { rows } = await pool.query(
        `INSERT INTO instructor_availability
           (instructor_id, start_date, end_date, type, status, reason, created_by, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, $4, 'approved', $5, $6, $6, NOW())
         RETURNING *`,
        [req.params.instructorId, start_date, end_date, type, reason || null, req.user.id]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      logger.error('Error creating admin availability block:', err);
      res.status(500).json({ error: 'Failed to create availability block' });
    }
  }
);

// PATCH /instructors/:instructorId/availability/:id — approve or reject
router.patch(
  '/:instructorId/availability/:id',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!['approved', 'rejected', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved, rejected, or cancelled' });
      }

      const { rows: existing } = await pool.query(
        'SELECT * FROM instructor_availability WHERE id = $1 AND instructor_id = $2',
        [req.params.id, req.params.instructorId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Availability entry not found' });
      }

      const { rows } = await pool.query(
        `UPDATE instructor_availability
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, req.user.id, req.params.id]
      );
      res.json(rows[0]);
    } catch (err) {
      logger.error('Error updating availability status:', err);
      res.status(500).json({ error: 'Failed to update availability status' });
    }
  }
);

// DELETE /instructors/:instructorId/availability/:id — admin remove
router.delete(
  '/:instructorId/availability/:id',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        'DELETE FROM instructor_availability WHERE id = $1 AND instructor_id = $2 RETURNING *',
        [req.params.id, req.params.instructorId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Availability entry not found' });
      }
      res.json({ success: true });
    } catch (err) {
      logger.error('Error deleting availability entry:', err);
      res.status(500).json({ error: 'Failed to delete availability entry' });
    }
  }
);

export default router;
