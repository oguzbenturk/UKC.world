// backend/routes/events.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = Router();

const ALLOWED_ROLES = ['admin', 'manager', 'developer'];

// Public endpoint - All authenticated users can view events
router.get('/public', authenticateJWT, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const filters = []; // Removed deleted_at filter until migration is applied
    const values = [];

    if (status) {
      values.push(status);
      filters.push(`e.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      filters.push(`e.start_at >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      filters.push(`e.start_at <= $${values.length}::timestamptz`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT
        e.*,
        COALESCE(
          (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered'),
          0
        ) as registration_count
      FROM events e
      ${whereClause}
      ORDER BY e.start_at DESC
    `;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching public events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Admin endpoint - For event management
router.get('/', authenticateJWT, authorizeRoles(ALLOWED_ROLES), async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const filters = []; // Removed deleted_at filter until migration is applied
    const values = [];

    if (status) {
      values.push(status);
      filters.push(`e.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      filters.push(`e.start_at >= $${values.length}::timestamptz`);
    }
    if (to) {
      values.push(to);
      filters.push(`e.start_at <= $${values.length}::timestamptz`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT
        e.*,
        u.name AS created_by_name,
        COALESCE(
          (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status = 'registered'),
          0
        ) as registration_count
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      ${whereClause}
      ORDER BY e.start_at DESC
    `;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post(
  '/',
  authenticateJWT,
  authorizeRoles(ALLOWED_ROLES),
  [
    body('name').isString().trim().notEmpty(),
    body('event_type').optional({ nullable: true }).isString().trim(),
    body('start_at').isISO8601(),
    body('end_at').optional({ nullable: true }).isISO8601(),
    body('location').optional({ nullable: true }).isString().trim(),
    body('description').optional({ nullable: true }).isString().trim(),
    body('status').optional({ nullable: true }).isString().trim(),
    body('capacity').optional({ nullable: true }).custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) throw new Error('Capacity must be a positive integer');
      return true;
    }),
    body('price').optional({ nullable: true }).custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseFloat(value);
      if (isNaN(num)) throw new Error('Price must be a number');
      return true;
    }),
    body('currency').optional({ nullable: true }).isString().trim(),
    body('image_url').optional({ nullable: true }).isString().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        event_type = 'other',
        start_at,
        end_at,
        location,
        description,
        status = 'scheduled',
        capacity,
        price,
        currency,
        image_url,
      } = req.body;

      const createdBy = req.user?.id || null;

      const query = `
        INSERT INTO events (
          name,
          event_type,
          start_at,
          end_at,
          location,
          description,
          status,
          capacity,
          price,
          currency,
          created_by,
          image_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `;

      const values = [
        name,
        event_type,
        start_at,
        end_at || null,
        location || null,
        description || null,
        status,
        capacity || null,
        price || null,
        currency || null,
        createdBy,
        image_url || null,
      ];

      const { rows } = await pool.query(query, values);
      return res.status(201).json(rows[0]);
    } catch (error) {
      logger.error('Error creating event:', error);
      return res.status(500).json({ error: 'Failed to create event' });
    }
  }
);

// Update an event
router.put(
  '/:eventId',
  authenticateJWT,
  authorizeRoles(ALLOWED_ROLES),
  [
    body('name').optional().isString().trim().notEmpty(),
    body('event_type').optional({ nullable: true }).isString().trim(),
    body('start_at').optional().isISO8601(),
    body('end_at').optional({ nullable: true }).isISO8601(),
    body('location').optional({ nullable: true }).isString().trim(),
    body('description').optional({ nullable: true }).isString().trim(),
    body('status').optional({ nullable: true }).isString().trim(),
    body('capacity').optional({ nullable: true }).custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) throw new Error('Capacity must be a positive integer');
      return true;
    }),
    body('price').optional({ nullable: true }).custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseFloat(value);
      if (isNaN(num)) throw new Error('Price must be a number');
      return true;
    }),
    body('currency').optional({ nullable: true }).isString().trim(),
    body('image_url').optional({ nullable: true }).isString().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { eventId } = req.params;
      const updates = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic update query
      Object.keys(req.body).forEach((key) => {
        if (req.body[key] !== undefined) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(req.body[key]);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(eventId);
      const query = `
        UPDATE events
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const { rows } = await pool.query(query, values);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      logger.info('Event updated', { eventId, userId: req.user?.id });
      return res.json(rows[0]);
    } catch (error) {
      logger.error('Error updating event:', error);
      return res.status(500).json({ error: 'Failed to update event' });
    }
  }
);

// Delete an event (soft delete)
router.delete('/:eventId', authenticateJWT, authorizeRoles(ALLOWED_ROLES), async (req, res) => {
  try {
    const { eventId } = req.params;

    // Soft delete - users who registered can still see it in their history
    const query = `
      UPDATE events
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const { rows } = await pool.query(query, [eventId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found or already deleted' });
    }

    logger.info('Event soft deleted', { eventId, userId: req.user?.id });
    return res.json({ message: 'Event deleted successfully', event: rows[0] });
  } catch (error) {
    logger.error('Error deleting event:', error);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Register for an event
router.post('/:eventId/register', authenticateJWT, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if event exists and has capacity
    const eventQuery = `
      SELECT 
        e.id, 
        e.capacity,
        COALESCE(
          (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND status = 'registered'),
          0
        ) as current_registrations
      FROM events e
      WHERE e.id = $1
    `;
    
    const { rows: eventRows } = await pool.query(eventQuery, [eventId]);
    
    if (eventRows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventRows[0];
    
    // Check capacity if set
    if (event.capacity && event.current_registrations >= event.capacity) {
      return res.status(400).json({ error: 'Event is full' });
    }

    // Insert registration (or update if already exists)
    const registerQuery = `
      INSERT INTO event_registrations (event_id, user_id, status)
      VALUES ($1, $2, 'registered')
      ON CONFLICT (event_id, user_id) 
      DO UPDATE SET status = 'registered', registered_at = NOW()
      RETURNING *
    `;

    const { rows } = await pool.query(registerQuery, [eventId, userId]);
    
    logger.info('User registered for event', { userId, eventId });
    return res.status(201).json(rows[0]);
  } catch (error) {
    logger.error('Error registering for event:', error);
    return res.status(500).json({ error: 'Failed to register for event' });
  }
});

// Cancel registration
router.delete('/:eventId/register', authenticateJWT, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      UPDATE event_registrations
      SET status = 'cancelled'
      WHERE event_id = $1 AND user_id = $2
      RETURNING *
    `;

    const { rows } = await pool.query(query, [eventId, userId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    logger.info('User cancelled event registration', { userId, eventId });
    return res.json(rows[0]);
  } catch (error) {
    logger.error('Error cancelling registration:', error);
    return res.status(500).json({ error: 'Failed to cancel registration' });
  }
});

// Get registrations for an event (admin only)
router.get('/:eventId/registrations', authenticateJWT, authorizeRoles(ALLOWED_ROLES), async (req, res) => {
  try {
    const { eventId } = req.params;

    const query = `
      SELECT 
        er.*,
        u.name AS user_name,
        u.email AS user_email
      FROM event_registrations er
      LEFT JOIN users u ON er.user_id = u.id
      WHERE er.event_id = $1 AND er.status = 'registered'
      ORDER BY er.registered_at ASC
    `;

    const { rows } = await pool.query(query, [eventId]);
    return res.json(rows);
  } catch (error) {
    logger.error('Error fetching registrations:', error);
    return res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

// Check if current user is registered
router.get('/:eventId/my-registration', authenticateJWT, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      SELECT * FROM event_registrations
      WHERE event_id = $1 AND user_id = $2
    `;

    const { rows } = await pool.query(query, [eventId, userId]);
    
    if (rows.length === 0) {
      return res.json({ registered: false });
    }

    return res.json({ 
      registered: rows[0].status === 'registered',
      registration: rows[0]
    });
  } catch (error) {
    logger.error('Error checking registration:', error);
    return res.status(500).json({ error: 'Failed to check registration' });
  }
});

export default router;
