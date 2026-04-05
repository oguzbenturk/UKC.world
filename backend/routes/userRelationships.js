/**
 * User Relationships Routes
 * Handles friend/connection management for group bookings
 */

import express from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  getFriends,
  getPendingRequests,
  getSentRequests,
  getRelationshipStatus,
  cancelFriendRequest
} from '../services/userRelationshipsService.js';

const router = express.Router();

const studentRoles = ['admin', 'manager', 'instructor', 'student', 'outsider'];

/**
 * Get list of friends (accepted connections)
 * GET /api/relationships/friends
 */
router.get('/friends', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const friends = await getFriends(userId);
    res.json({ friends });
  } catch (error) {
    logger.error('Error getting friends', { error: error.message });
    next(error);
  }
});

/**
 * Get pending friend requests (received)
 * GET /api/relationships/pending
 */
router.get('/pending', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requests = await getPendingRequests(userId);
    res.json({ requests });
  } catch (error) {
    logger.error('Error getting pending requests', { error: error.message });
    next(error);
  }
});

/**
 * Get sent friend requests
 * GET /api/relationships/sent
 */
router.get('/sent', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const requests = await getSentRequests(userId);
    res.json({ requests });
  } catch (error) {
    logger.error('Error getting sent requests', { error: error.message });
    next(error);
  }
});

/**
 * Get relationship status with another user
 * GET /api/relationships/status/:userId
 */
router.get('/status/:userId', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.userId;
    const status = await getRelationshipStatus(userId, otherUserId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting relationship status', { error: error.message });
    next(error);
  }
});

/**
 * Send a friend request
 * POST /api/relationships/request
 */
router.post('/request', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId, message } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }

    const result = await sendFriendRequest(senderId, receiverId, message);
    res.json(result);
  } catch (error) {
    logger.error('Error sending friend request', { error: error.message });
    if (error.message.includes('already') || error.message.includes('yourself') || error.message.includes('Unable')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Accept a friend request
 * POST /api/relationships/:id/accept
 */
router.post('/:id/accept', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const relationshipId = req.params.id;

    const result = await acceptFriendRequest(userId, relationshipId);
    res.json(result);
  } catch (error) {
    logger.error('Error accepting friend request', { error: error.message });
    if (error.message.includes('not found') || error.message.includes('not authorized') || error.message.includes('cannot')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Decline a friend request
 * POST /api/relationships/:id/decline
 */
router.post('/:id/decline', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const relationshipId = req.params.id;

    const result = await declineFriendRequest(userId, relationshipId);
    res.json(result);
  } catch (error) {
    logger.error('Error declining friend request', { error: error.message });
    if (error.message.includes('not found') || error.message.includes('not authorized')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Cancel a sent friend request
 * DELETE /api/relationships/:id/cancel
 */
router.delete('/:id/cancel', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const relationshipId = req.params.id;

    const result = await cancelFriendRequest(userId, relationshipId);
    res.json(result);
  } catch (error) {
    logger.error('Error cancelling friend request', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Remove a friend (unfriend)
 * DELETE /api/relationships/friend/:userId
 */
router.delete('/friend/:userId', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.userId;

    const result = await removeFriend(userId, friendId);
    res.json(result);
  } catch (error) {
    logger.error('Error removing friend', { error: error.message });
    if (error.message.includes('not connected')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Block a user
 * POST /api/relationships/block/:userId
 */
router.post('/block/:userId', authenticateJWT, authorizeRoles(studentRoles), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const blockedUserId = req.params.userId;

    const result = await blockUser(userId, blockedUserId);
    res.json(result);
  } catch (error) {
    logger.error('Error blocking user', { error: error.message });
    next(error);
  }
});

export default router;
