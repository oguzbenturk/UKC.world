import express from 'express';
import { logger } from '../middlewares/errorHandler.js';
import * as proposalsService from '../services/proposalsService.js';

// Public, unauthenticated router. Mounted at /api/public/proposals in server.js
// (mirrors /api/public/forms). Access is gated only by the unguessable share code.
const router = express.Router();

/** GET /api/public/proposals/:code — public view payload (no PII / internal fields). */
router.get('/:code', async (req, res) => {
  try {
    const proposal = await proposalsService.getProposalByShareCode(req.params.code);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    // Best-effort view tracking; never block the response on it.
    proposalsService.recordView(req.params.code).catch((e) =>
      logger.warn('Failed to record proposal view:', e?.message || e));

    res.json(proposal);
  } catch (error) {
    logger.error('Error fetching public proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

/** POST /api/public/proposals/:code/accept — customer accepts (idempotent). */
router.post('/:code/accept', async (req, res) => {
  try {
    const result = await proposalsService.acceptProposalByCode(req.params.code);
    if (!result) return res.status(400).json({ error: 'Proposal cannot be accepted (not found or expired)' });
    res.json({ message: 'Proposal accepted', status: result.status, accepted_at: result.accepted_at });
  } catch (error) {
    logger.error('Error accepting public proposal:', error);
    res.status(500).json({ error: 'Failed to accept proposal' });
  }
});

export default router;
