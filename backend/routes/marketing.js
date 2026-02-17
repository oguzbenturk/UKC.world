import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign
} from '../services/marketingCampaignService.js';

const router = express.Router();

/**
 * GET /api/marketing/campaigns
 * Get all campaigns (admin/manager only)
 */
router.get('/campaigns', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const { type, status } = req.query;
    const campaigns = await getAllCampaigns({ type, status });
    res.json({ data: campaigns });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/marketing/campaigns/:id
 * Get campaign by ID
 */
router.get('/campaigns/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const campaign = await getCampaignById(parseInt(req.params.id, 10));
    res.json({ data: campaign });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketing/campaigns
 * Create new campaign
 */
router.post('/campaigns', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const campaign = await createCampaign(req.body, req.user.id);
    res.status(201).json({ data: campaign });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/marketing/campaigns/:id
 * Update campaign
 */
router.patch('/campaigns/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const updated = await updateCampaign(parseInt(req.params.id, 10), req.body);
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/marketing/campaigns/:id/send
 * Send campaign to selected customers
 */
router.post('/campaigns/:id/send', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const { customerIds } = req.body;
    
    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: 'customerIds array is required' });
    }

    const campaignId = parseInt(req.params.id, 10);
    const campaign = await getCampaignById(campaignId);
    
    // TODO: Implement actual sending logic based on campaign type
    // For now, just update the sent count
    await updateCampaign(campaignId, {
      status: 'active',
      sent_count: (campaign.sent_count || 0) + customerIds.length
    });

    res.json({ 
      message: 'Campaign sent successfully',
      sentTo: customerIds.length 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/marketing/campaigns/:id
 * Delete campaign
 */
router.delete('/campaigns/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    await deleteCampaign(parseInt(req.params.id, 10));
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
