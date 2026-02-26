/**
 * Group Lesson Request Routes
 * 
 * POST   /api/group-lesson-requests         — Student submits a request
 * GET    /api/group-lesson-requests         — Student: own requests | Admin: all requests
 * DELETE /api/group-lesson-requests/:id     — Student cancels own request | Admin cancels any
 * POST   /api/group-lesson-requests/match   — Admin/Manager matches requests into a group
 */

import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  createGroupLessonRequest,
  getUserRequests,
  getAllRequests,
  cancelRequest,
  adminCancelRequest,
  matchRequests,
  getRequestById
} from '../services/groupLessonRequestService.js';

const router = express.Router();

/**
 * POST / — Submit a group lesson request
 * Allowed: student, outsider (anyone with an account)
 */
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager', 'student', 'outsider']), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      serviceId,
      preferredDateStart,
      preferredDateEnd,
      preferredTimeOfDay,
      preferredDurationHours,
      skillLevel,
      notes
    } = req.body;

    if (!serviceId) {
      return res.status(400).json({ error: 'serviceId is required' });
    }
    if (!preferredDateStart) {
      return res.status(400).json({ error: 'preferredDateStart is required' });
    }

    const request = await createGroupLessonRequest({
      userId,
      serviceId,
      preferredDateStart,
      preferredDateEnd,
      preferredTimeOfDay,
      preferredDurationHours,
      skillLevel,
      notes
    });

    res.status(201).json({ request });
  } catch (error) {
    logger.error('Error creating group lesson request', { error: error.message });
    next(error);
  }
});

/**
 * GET / — List requests
 * Students see their own. Admin/manager see all with optional filters.
 */
router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const role = req.user.role;
    const isStaff = ['admin', 'manager', 'super_admin', 'developer'].includes(role);

    if (isStaff) {
      const { status, serviceId, skillLevel } = req.query;
      const requests = await getAllRequests({ status, serviceId, skillLevel });
      return res.json({ requests });
    }

    // Student: own requests
    const requests = await getUserRequests(req.user.id);
    res.json({ requests });
  } catch (error) {
    logger.error('Error fetching group lesson requests', { error: error.message });
    next(error);
  }
});

/**
 * DELETE /:id — Cancel a request
 * Student can cancel their own. Admin/manager can cancel any.
 */
router.delete('/:id', authenticateJWT, async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const isStaff = ['admin', 'manager', 'super_admin', 'developer'].includes(role);

    let result;
    if (isStaff) {
      result = await adminCancelRequest(id);
    } else {
      result = await cancelRequest(id, req.user.id);
    }

    res.json({ request: result, message: 'Request cancelled' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error cancelling group lesson request', { error: error.message });
    next(error);
  }
});

/**
 * POST /match — Match selected requests into a group booking
 * Admin/Manager only
 */
router.post('/match', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res, next) => {
  try {
    const matchedBy = req.user.id;
    const {
      requestIds,
      title,
      instructorId,
      scheduledDate,
      startTime,
      durationHours,
      pricePerPerson,
      currency,
      notes
    } = req.body;

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 request IDs are required' });
    }

    const result = await matchRequests({
      requestIds,
      matchedBy,
      title,
      instructorId,
      scheduledDate,
      startTime,
      durationHours,
      pricePerPerson,
      currency,
      notes
    });

    res.status(201).json({
      message: `Successfully matched ${result.matchedRequests.length} requests into a group`,
      groupBooking: result.groupBooking,
      matchedRequests: result.matchedRequests
    });
  } catch (error) {
    if (error.message.includes('not available') || error.message.includes('same lesson type') || error.message.includes('At least 2')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error matching group lesson requests', { error: error.message });
    next(error);
  }
});

export default router;
