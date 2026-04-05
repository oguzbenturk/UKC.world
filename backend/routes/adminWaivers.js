import express from 'express';
import { query, param } from 'express-validator';
import { authenticateJWT } from './auth.js';
import { authorizeRoles, validateInput } from '../middlewares/authorize.js';
import {
  listAdminWaivers,
  getAdminWaiverDetail,
  getAdminWaiverStats,
  exportAdminWaiversCsv
} from '../services/adminWaiverService.js';

const router = express.Router();

const STATUS_OPTIONS = ['valid', 'expired', 'outdated', 'missing', 'pending', 'signed'];
const TYPE_OPTIONS = ['user', 'family'];
const SORT_OPTIONS = ['name', 'signedAt', 'status', 'updated'];
const DIRECTION_OPTIONS = ['ASC', 'DESC', 'asc', 'desc'];

const listValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or greater'),
  query('pageSize').optional().isInt({ min: 1, max: 200 }).withMessage('pageSize must be between 1 and 200'),
  query('search').optional().isLength({ max: 200 }).withMessage('search query must be 200 characters or less'),
  query('status').optional().isIn([...STATUS_OPTIONS, 'all']).withMessage('status is invalid'),
  query('subjectType').optional().isIn([...TYPE_OPTIONS, 'all']).withMessage('subjectType is invalid'),
  query('sortBy').optional().isIn(SORT_OPTIONS).withMessage('sortBy is invalid'),
  query('sortDirection').optional().isIn(DIRECTION_OPTIONS).withMessage('sortDirection is invalid')
];

router.get(
  '/',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  validateInput(listValidation),
  async (req, res, next) => {
    try {
      const {
        page,
        pageSize,
        search,
        status,
        subjectType,
        sortBy,
        sortDirection
      } = req.query;

      const result = await listAdminWaivers({
        page,
        pageSize,
        search,
        status: status === 'all' ? undefined : status,
        subjectType: subjectType === 'all' ? undefined : subjectType,
        sortBy,
        sortDirection
      });

      res.json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/stats',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  validateInput(listValidation),
  async (req, res, next) => {
    try {
      const { search, status, subjectType } = req.query;
      const stats = await getAdminWaiverStats({
        search,
        status: status === 'all' ? undefined : status,
        subjectType: subjectType === 'all' ? undefined : subjectType
      });

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/export',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  validateInput(listValidation),
  async (req, res, next) => {
    try {
      const { search, status, subjectType } = req.query;
      const csv = await exportAdminWaiversCsv({
        search,
        status: status === 'all' ? undefined : status,
        subjectType: subjectType === 'all' ? undefined : subjectType
      });

      const timestamp = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="waivers-${timestamp}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

const detailValidation = [
  param('subjectId').isUUID().withMessage('subjectId must be a valid UUID'),
  query('type').isIn(TYPE_OPTIONS).withMessage('type must be either "user" or "family"')
];

router.get(
  '/subjects/:subjectId',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  validateInput(detailValidation),
  async (req, res, next) => {
    try {
      const { subjectId } = req.params;
      const { type } = req.query;

      const detail = await getAdminWaiverDetail({
        subjectId,
        subjectType: type,
        actorUserId: req.user?.id,
        ipAddress: req.headers['x-forwarded-for'] || req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown'
      });

      if (!detail) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      res.json({
        success: true,
        data: detail
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
