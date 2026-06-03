import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import * as proposalsService from '../services/proposalsService.js';

const router = express.Router();

// Mounted behind authenticateJWT in server.js. Restrict to admin/manager.
router.use(authorizeRoles(['admin', 'manager']));

/** GET /api/proposals — list (filters: status, q, customer_id) */
router.get('/', async (req, res) => {
  try {
    const { status, q, customer_id } = req.query;
    const proposals = await proposalsService.listProposals({ status, q, customer_id });
    res.json(proposals);
  } catch (error) {
    logger.error('Error listing proposals:', error);
    res.status(500).json({ error: 'Failed to list proposals' });
  }
});

/** GET /api/proposals/templates — reusable template blueprints */
router.get('/templates', async (req, res) => {
  try {
    const templates = await proposalsService.listProposals({ is_template: true });
    res.json(templates);
  } catch (error) {
    logger.error('Error listing proposal templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/** GET /api/proposals/:id — full proposal incl. content */
router.get('/:id', async (req, res) => {
  try {
    const proposal = await proposalsService.getProposalById(req.params.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json(proposal);
  } catch (error) {
    logger.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

/** POST /api/proposals — create */
router.post('/', async (req, res) => {
  try {
    const proposal = await proposalsService.createProposal(req.body, req.user.id);
    res.status(201).json(proposal);
  } catch (error) {
    logger.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

/** PATCH /api/proposals/:id — update */
router.patch('/:id', async (req, res) => {
  try {
    const proposal = await proposalsService.updateProposal(req.params.id, req.body);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json(proposal);
  } catch (error) {
    logger.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

/** POST /api/proposals/:id/duplicate — clone */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const proposal = await proposalsService.duplicateProposal(req.params.id, req.user.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.status(201).json(proposal);
  } catch (error) {
    logger.error('Error duplicating proposal:', error);
    res.status(500).json({ error: 'Failed to duplicate proposal' });
  }
});

/** POST /api/proposals/:id/save-as-template — clone into a reusable template */
router.post('/:id/save-as-template', async (req, res) => {
  try {
    const tpl = await proposalsService.duplicateProposal(req.params.id, req.user.id, {
      asTemplate: true,
      titleSuffix: req.body?.titleSuffix ?? '',
    });
    if (!tpl) return res.status(404).json({ error: 'Proposal not found' });
    res.status(201).json(tpl);
  } catch (error) {
    logger.error('Error saving proposal as template:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

/** POST /api/proposals/:id/send — mark as sent */
router.post('/:id/send', async (req, res) => {
  try {
    const proposal = await proposalsService.setStatus(req.params.id, 'sent');
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json(proposal);
  } catch (error) {
    logger.error('Error sending proposal:', error);
    res.status(500).json({ error: 'Failed to send proposal' });
  }
});

/** DELETE /api/proposals/:id */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await proposalsService.deleteProposal(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Proposal not found' });
    res.json({ message: 'Proposal deleted successfully' });
  } catch (error) {
    logger.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

export default router;
