import { Router } from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { getDashboardSummary } from '../services/dashboardSummaryService.js';
import { logger } from '../middlewares/errorHandler.js';
import { cacheMiddleware } from '../middlewares/cache.js';

const router = Router();
const MANAGEMENT_ROLES = ['admin', 'manager', 'owner', 'developer'];

const dashboardCacheKey = (req) =>
  `api:dashboard:${req.query.startDate || 'all'}:${req.query.endDate || 'all'}`;

router.get('/summary', authenticateJWT, authorizeRoles(MANAGEMENT_ROLES), cacheMiddleware(60, dashboardCacheKey), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = await getDashboardSummary({ startDate, endDate });
    res.json(summary);
  } catch (error) {
    logger.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
