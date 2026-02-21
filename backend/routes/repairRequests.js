import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import {
  getRepairRequests,
  createRepairRequest,
  updateRepairRequest,
  getRepairStatistics,
  getRepairComments,
  addRepairComment,
  createGuestRepairRequest,
  getRepairRequestByToken
} from '../services/repairRequestService.js';

const router = express.Router();

/**
 * GET /api/repair-requests
 * Get repair requests (all for admin/manager, own for users)
 */
router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const { status, priority, userId } = req.query;
    const requests = await getRepairRequests(
      { status, priority, userId },
      req.user.id,
      req.user.role
    );
    res.json({ data: requests });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repair-requests/statistics
 * Get repair statistics (admin/manager only)
 */
router.get('/statistics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const stats = await getRepairStatistics();
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/repair-requests/guest
 * Create a repair request without authentication.
 * Returns a tracking token so the guest can check status later.
 */
router.post('/guest', async (req, res, next) => {
  try {
    const { guestName, guestEmail, equipmentType, itemName, description, priority } = req.body;

    if (!equipmentType || !itemName || !description || !priority) {
      return res.status(400).json({ error: 'equipmentType, itemName, description and priority are required' });
    }

    const request = await createGuestRepairRequest(req.body);
    res.status(201).json({
      data: request,
      trackingToken: request.tracking_token,
      message: 'Repair request submitted. Use the tracking token to check your request status.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repair-requests/track/:token
 * Look up a repair request by its public tracking token (no auth required).
 */
router.get('/track/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const request = await getRepairRequestByToken(token);

    if (!request) {
      return res.status(404).json({ error: 'Repair request not found. Please check your tracking token.' });
    }

    res.json({ data: request });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/repair-requests
 * Create a new repair request
 */
router.post('/', authenticateJWT, async (req, res, next) => {
  try {
    const request = await createRepairRequest(req.body, req.user.id);
    res.status(201).json({ data: request });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/repair-requests/:id
 * Update repair request (admin/manager only)
 */
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await updateRepairRequest(parseInt(id, 10), req.body);
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/repair-requests/:id/comments
 * Get comments for a repair request
 */
router.get('/:id/comments', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const comments = await getRepairComments(
      parseInt(id, 10), 
      req.user.id, 
      req.user.role
    );
    res.json({ data: comments });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/repair-requests/:id/comments
 * Add a comment to a repair request
 */
router.post('/:id/comments', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, isInternal } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Only admin/manager can post internal comments
    const internal = isInternal && ['admin', 'manager'].includes(req.user.role);
    
    const comment = await addRepairComment(
      parseInt(id, 10),
      req.user.id,
      req.user.role,
      message.trim(),
      internal
    );
    res.status(201).json({ data: comment });
  } catch (error) {
    next(error);
  }
});

export default router;
