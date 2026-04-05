import { Router } from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { getDashboardSummary } from '../services/dashboardSummaryService.js';

const router = Router();
const MANAGEMENT_ROLES = ['admin', 'manager', 'owner', 'developer'];

router.get('/summary', authenticateJWT, authorizeRoles(MANAGEMENT_ROLES), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = await getDashboardSummary({ startDate, endDate });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
