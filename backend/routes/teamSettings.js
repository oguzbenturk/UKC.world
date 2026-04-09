import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { getTeamSettings, saveTeamSettings } from '../services/teamSettingsService.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

router.get('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const settings = await getTeamSettings();
    res.json(settings);
  } catch (err) {
    logger.error('Failed to fetch team settings', err);
    res.status(500).json({ error: 'Failed to fetch team settings' });
  }
});

router.put('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { members, global } = req.body;
    await saveTeamSettings({ members, global });
    const updated = await getTeamSettings();
    res.json(updated);
  } catch (err) {
    logger.error('Failed to save team settings', err);
    res.status(500).json({ error: 'Failed to save team settings' });
  }
});

export default router;
