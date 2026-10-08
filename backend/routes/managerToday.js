// Manager "Today" dashboard endpoint (GET /api/manager/today).
// Mounted in server.js under /api/manager/today with authenticateJWT. Staff-only:
// the data covers every instructor, booking, payout request and the money tiles.

import express from 'express';
import { query, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { isPlainDate } from '../services/instructorTodayService.js';
import { getManagerToday } from '../services/managerTodayService.js';

const router = express.Router();
export const MANAGER_TODAY_ROLES = ['admin', 'manager', 'owner', 'super_admin', 'developer'];

/** GET /api/manager/today?date=YYYY-MM-DD (default: today, business timezone) */
router.get('/',
  authorizeRoles(MANAGER_TODAY_ROLES),
  query('date').optional().custom((value) => isPlainDate(value)).withMessage('date must be a valid YYYY-MM-DD date'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, code: 'VALIDATION_ERROR' });
    }
    try {
      const viewer = { id: req.user?.id, role: String(req.user?.role || '').toLowerCase() };
      return res.json(await getManagerToday({ date: req.query.date, viewer }));
    } catch (error) {
      logger.error('Failed to load manager today', { error: error?.message, stack: error?.stack });
      return res.status(500).json({ error: 'Failed to load today' });
    }
  });

export default router;
