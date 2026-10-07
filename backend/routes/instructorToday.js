// Instructor "My day" dashboard endpoints.
// Mounted by routes/instructor.js under /me → /api/instructors/me/* (authenticateJWT
// is applied where instructor.js is mounted in server.js). Both handlers are pinned
// to req.user.id — an instructor only ever sees their own lessons, and waiver /
// note details only for the participants of those lessons.

import express from 'express';
import { query, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { getInstructorToday, getInstructorWeek, isPlainDate } from '../services/instructorTodayService.js';

const router = express.Router();
const INSTRUCTOR_ROLES = ['instructor', 'manager'];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, code: 'VALIDATION_ERROR', details: errors.array() });
  }
  return next();
};

const plainDateQuery = (name) => query(name)
  .optional()
  .custom((value) => isPlainDate(value))
  .withMessage(`${name} must be a valid YYYY-MM-DD date`);

/** GET /api/instructors/me/today?date=YYYY-MM-DD (default: today, business timezone) */
router.get('/today',
  authorizeRoles(INSTRUCTOR_ROLES),
  plainDateQuery('date'),
  validate,
  async (req, res) => {
    try {
      res.json(await getInstructorToday(req.user.id, { date: req.query.date }));
    } catch (error) {
      logger.error('Failed to load instructor day', { error: error?.message, stack: error?.stack });
      res.status(500).json({ error: 'Failed to load your day' });
    }
  });

/** GET /api/instructors/me/week?start=YYYY-MM-DD (default: Monday of this week) */
router.get('/week',
  authorizeRoles(INSTRUCTOR_ROLES),
  plainDateQuery('start'),
  validate,
  async (req, res) => {
    try {
      res.json(await getInstructorWeek(req.user.id, { start: req.query.start }));
    } catch (error) {
      logger.error('Failed to load instructor week', { error: error?.message, stack: error?.stack });
      res.status(500).json({ error: 'Failed to load your week' });
    }
  });

export default router;
