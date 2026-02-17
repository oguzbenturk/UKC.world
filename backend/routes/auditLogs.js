import express from 'express';
import { query } from 'express-validator';
import { authenticateJWT } from './auth.js';
import { authorizeRoles, validateInput } from '../middlewares/authorize.js';
import { queryAuditLogs } from '../services/auditLogService.js';

const router = express.Router();

const listValidation = [
  query('resourceType').optional().isLength({ max: 50 }).withMessage('resourceType must be 50 characters or less'),
  query('eventType').optional().isLength({ max: 100 }).withMessage('eventType must be 100 characters or less'),
  query('actorUserId').optional().isUUID().withMessage('actorUserId must be a valid UUID'),
  query('targetUserId').optional().isUUID().withMessage('targetUserId must be a valid UUID'),
  query('familyMemberId').optional().isUUID().withMessage('familyMemberId must be a valid UUID'),
  query('waiverId').optional().isUUID().withMessage('waiverId must be a valid UUID'),
  query('startDate').optional().isISO8601().withMessage('startDate must be an ISO8601 date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be an ISO8601 date'),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be 0 or greater')
];

router.get(
  '/',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  validateInput(listValidation),
  async (req, res, next) => {
    try {
      const {
        resourceType,
        eventType,
        actorUserId,
        targetUserId,
        familyMemberId,
        waiverId,
        startDate,
        endDate,
        limit,
        offset
      } = req.query;

      const result = await queryAuditLogs({
        resourceType,
        eventType,
        actorUserId,
        targetUserId,
        familyMemberId,
        waiverId,
        startDate,
        endDate,
        limit,
        offset
      });

      res.json({
        success: true,
        data: result.rows,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
