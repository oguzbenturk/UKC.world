import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from '../utils/auth.js';
import { getDailyOperations } from '../services/dailyOperationsService.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

router.get('/', authenticateJWT, authorizeRoles(['admin','manager']), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const rentalsScope = req.query.rentalsScope || 'both';
    const data = await getDailyOperations({ date, rentalsScope });
    res.json(data);
  } catch (err) {
    logger.error('Daily operations error', err);
    res.status(500).json({ error: 'Failed to load daily operations' });
  }
});

export default router;
