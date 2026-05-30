// Family groups: adult peer-linked customer accounts.
// Staff (admin/manager/receptionist) creates/edits groups.
// Any authenticated user can GET their own group.

import express from 'express';
import { body, param } from 'express-validator';
import { authenticateJWT } from './auth.js';
import { authorizeRoles, validateInput } from '../middlewares/authorize.js';
import familyGroupService from '../services/familyGroupService.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

const STAFF_ROLES = ['admin', 'manager', 'receptionist', 'owner'];

const uuidParam = (name) => param(name).isUUID().withMessage(`${name} must be a UUID`);
const uuidBody = (name) => body(name).isUUID().withMessage(`${name} must be a UUID`);

// GET /api/family-groups/by-user/:userId
// Any authenticated user can fetch their own group; staff can fetch anyone's.
router.get(
  '/by-user/:userId',
  authenticateJWT,
  validateInput([uuidParam('userId')]),
  async (req, res) => {
    const { userId } = req.params;
    const isStaff = STAFF_ROLES.includes(req.user?.role);
    if (!isStaff && req.user?.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const group = await familyGroupService.getGroupByUserId(userId);
      res.json({ success: true, data: group });
    } catch (err) {
      logger.error('Failed to fetch family group by user', { userId, err: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// GET /api/family-groups/:groupId
router.get(
  '/:groupId',
  authenticateJWT,
  validateInput([uuidParam('groupId')]),
  async (req, res) => {
    try {
      const group = await familyGroupService.getGroupById(req.params.groupId);
      if (!group) return res.status(404).json({ error: 'Family group not found' });

      const isStaff = STAFF_ROLES.includes(req.user?.role);
      const isMember = group.members.some((m) => m.id === req.user?.id);
      if (!isStaff && !isMember) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.json({ success: true, data: group });
    } catch (err) {
      logger.error('Failed to fetch family group', { id: req.params.groupId, err: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/family-groups
// body: { organizerUserId, memberUserIds: [], name? }
router.post(
  '/',
  authenticateJWT,
  authorizeRoles(STAFF_ROLES),
  validateInput([
    uuidBody('organizerUserId'),
    body('memberUserIds').isArray({ min: 1 }).withMessage('memberUserIds must include at least 1 user'),
    body('memberUserIds.*').isUUID().withMessage('Each memberUserId must be a UUID'),
    body('name').optional().isString().isLength({ max: 120 }),
  ]),
  async (req, res) => {
    try {
      const group = await familyGroupService.createGroup({
        organizerUserId: req.body.organizerUserId,
        memberUserIds: req.body.memberUserIds,
        name: req.body.name || null,
        createdBy: req.user?.id || null,
      });
      res.status(201).json({ success: true, data: group });
    } catch (err) {
      logger.error('Failed to create family group', { err: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// POST /api/family-groups/:groupId/members  body: { userId }
router.post(
  '/:groupId/members',
  authenticateJWT,
  authorizeRoles(STAFF_ROLES),
  validateInput([uuidParam('groupId'), uuidBody('userId')]),
  async (req, res) => {
    try {
      const group = await familyGroupService.addMember(req.params.groupId, req.body.userId);
      res.json({ success: true, data: group });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/family-groups/:groupId/members/:userId
router.delete(
  '/:groupId/members/:userId',
  authenticateJWT,
  authorizeRoles(STAFF_ROLES),
  validateInput([uuidParam('groupId'), uuidParam('userId')]),
  async (req, res) => {
    try {
      const result = await familyGroupService.removeMember(req.params.groupId, req.params.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// PATCH /api/family-groups/:groupId/organizer  body: { userId }
router.patch(
  '/:groupId/organizer',
  authenticateJWT,
  authorizeRoles(STAFF_ROLES),
  validateInput([uuidParam('groupId'), uuidBody('userId')]),
  async (req, res) => {
    try {
      const group = await familyGroupService.changeOrganizer(req.params.groupId, req.body.userId);
      res.json({ success: true, data: group });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// DELETE /api/family-groups/:groupId  (disband)
router.delete(
  '/:groupId',
  authenticateJWT,
  authorizeRoles(STAFF_ROLES),
  validateInput([uuidParam('groupId')]),
  async (req, res) => {
    try {
      const result = await familyGroupService.disbandGroup(req.params.groupId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
