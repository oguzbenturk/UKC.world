/**
 * Voucher Routes
 * 
 * API endpoints for voucher/promo code/gift management
 * 
 * Admin endpoints:
 *   POST   /api/vouchers              - Create voucher
 *   GET    /api/vouchers              - List vouchers (with filters)
 *   GET    /api/vouchers/:id          - Get voucher details
 *   PUT    /api/vouchers/:id          - Update voucher
 *   DELETE /api/vouchers/:id          - Deactivate voucher
 *   POST   /api/vouchers/bulk         - Generate bulk vouchers
 *   POST   /api/vouchers/:id/assign   - Assign to user
 *   GET    /api/vouchers/:id/redemptions - Get redemption history
 * 
 * User endpoints:
 *   POST   /api/vouchers/validate     - Validate a code
 *   GET    /api/vouchers/my           - Get my vouchers
 * 
 * Campaign endpoints:
 *   POST   /api/vouchers/campaigns       - Create campaign
 *   GET    /api/vouchers/campaigns       - List campaigns
 *   GET    /api/vouchers/campaigns/:id   - Get campaign with stats
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import voucherService from '../services/voucherService.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })) 
    });
  }
  next();
};

// ============ USER ENDPOINTS ============

/**
 * POST /api/vouchers/validate
 * Validate a voucher code for current user
 */
router.post('/validate',
  authenticateJWT,
  [
    body('code').trim().notEmpty().withMessage('Voucher code is required'),
    body('context').isIn(['lessons', 'rentals', 'accommodation', 'packages', 'wallet', 'all'])
      .withMessage('Invalid context'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('serviceId').optional().isUUID().withMessage('Invalid service ID'),
    body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters')
  ],
  validate,
  async (req, res, next) => {
    try {
      const { code, context, amount = 0, serviceId, currency = 'EUR' } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      const result = await voucherService.validateVoucher({
        code,
        userId,
        userRole,
        context,
        amount,
        serviceId,
        currency
      });
      
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }
      
      res.json({
        success: true,
        voucher: result.voucher,
        discount: result.discount
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/vouchers/my
 * Get vouchers assigned to current user
 */
router.get('/my',
  authenticateJWT,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const includeUsed = req.query.includeUsed === 'true';
      
      const vouchers = await voucherService.getUserVouchers(userId, !includeUsed);
      
      res.json({
        success: true,
        vouchers
      });
      
    } catch (error) {
      next(error);
    }
  }
);

// ============ ADMIN ENDPOINTS ============

/**
 * POST /api/vouchers
 * Create a new voucher
 */
router.post('/',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    body('code').trim().notEmpty().isLength({ min: 3, max: 50 })
      .withMessage('Code must be 3-50 characters'),
    body('name').trim().notEmpty().isLength({ max: 255 })
      .withMessage('Name is required and must be less than 255 characters'),
    body('voucher_type').isIn(['percentage', 'fixed_amount', 'wallet_credit', 'free_service', 'package_upgrade'])
      .withMessage('Invalid voucher type'),
    body('discount_value').isFloat({ min: 0 })
      .withMessage('Discount value must be a positive number'),
    body('max_discount').optional().isFloat({ min: 0 })
      .withMessage('Max discount must be a positive number'),
    body('min_purchase_amount').optional().isFloat({ min: 0 })
      .withMessage('Minimum purchase amount must be a positive number'),
    body('currency').optional().isLength({ min: 3, max: 3 })
      .withMessage('Currency must be 3 characters'),
    body('applies_to').optional().isIn(['all', 'lessons', 'rentals', 'accommodation', 'packages', 'wallet', 'specific'])
      .withMessage('Invalid applies_to value'),
    body('usage_type').optional().isIn(['single_global', 'single_per_user', 'multi_limited', 'multi_per_user', 'unlimited'])
      .withMessage('Invalid usage type'),
    body('max_total_uses').optional().isInt({ min: 1 })
      .withMessage('Max total uses must be a positive integer'),
    body('max_uses_per_user').optional().isInt({ min: 1 })
      .withMessage('Max uses per user must be a positive integer'),
    body('valid_from').optional().isISO8601()
      .withMessage('Valid from must be a valid date'),
    body('valid_until').optional().isISO8601()
      .withMessage('Valid until must be a valid date'),
    body('visibility').optional().isIn(['public', 'private', 'role_based'])
      .withMessage('Invalid visibility'),
    body('campaign_id').optional().isUUID()
      .withMessage('Invalid campaign ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      const voucher = await voucherService.createVoucher(req.body, req.user.id);
      
      logger.info('Admin created voucher', { 
        adminId: req.user.id, 
        voucherCode: voucher.code 
      });
      
      res.status(201).json({
        success: true,
        voucher
      });
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(400).json({
          success: false,
          error: 'DUPLICATE_CODE',
          message: error.message
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/vouchers
 * List vouchers with filters
 */
router.get('/',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('is_active').optional().isIn(['true', 'false']).withMessage('is_active must be true or false'),
    query('voucher_type').optional().isIn(['percentage', 'fixed_amount', 'wallet_credit', 'free_service', 'package_upgrade'])
      .withMessage('Invalid voucher type'),
    query('visibility').optional().isIn(['public', 'private', 'role_based'])
      .withMessage('Invalid visibility'),
    query('campaign_id').optional().isUUID().withMessage('Invalid campaign ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
        voucher_type: req.query.voucher_type,
        visibility: req.query.visibility,
        campaign_id: req.query.campaign_id,
        search: req.query.search
      };
      
      const result = await voucherService.listVouchers(filters);
      
      res.json({
        success: true,
        ...result
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/vouchers/:id
 * Get voucher details
 */
router.get('/:id',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    param('id').isUUID().withMessage('Invalid voucher ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      const voucher = await voucherService.getVoucherById(req.params.id);
      
      if (!voucher) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Voucher not found'
        });
      }
      
      res.json({
        success: true,
        voucher
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/vouchers/:id
 * Update voucher
 */
router.put('/:id',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    param('id').isUUID().withMessage('Invalid voucher ID'),
    body('name').optional().trim().isLength({ max: 255 }),
    body('discount_value').optional().isFloat({ min: 0 }),
    body('max_discount').optional().isFloat({ min: 0 }),
    body('min_purchase_amount').optional().isFloat({ min: 0 }),
    body('max_total_uses').optional().isInt({ min: 1 }),
    body('max_uses_per_user').optional().isInt({ min: 1 }),
    body('valid_from').optional().isISO8601(),
    body('valid_until').optional().isISO8601(),
    body('is_active').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const voucher = await voucherService.updateVoucher(req.params.id, req.body);
      
      if (!voucher) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Voucher not found'
        });
      }
      
      logger.info('Admin updated voucher', { 
        adminId: req.user.id, 
        voucherId: req.params.id 
      });
      
      res.json({
        success: true,
        voucher
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/vouchers/:id
 * Deactivate voucher (soft delete)
 */
router.delete('/:id',
  authenticateJWT,
  authorizeRoles(['admin']),
  [
    param('id').isUUID().withMessage('Invalid voucher ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      await voucherService.deleteVoucher(req.params.id);
      
      logger.info('Admin deactivated voucher', { 
        adminId: req.user.id, 
        voucherId: req.params.id 
      });
      
      res.json({
        success: true,
        message: 'Voucher deactivated'
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/vouchers/bulk
 * Generate bulk voucher codes
 */
router.post('/bulk',
  authenticateJWT,
  authorizeRoles(['admin']),
  [
    body('count').isInt({ min: 1, max: 1000 }).withMessage('Count must be 1-1000'),
    body('prefix').optional().trim().isLength({ max: 10 }).withMessage('Prefix must be max 10 characters'),
    body('template.voucher_type').isIn(['percentage', 'fixed_amount', 'wallet_credit', 'free_service', 'package_upgrade'])
      .withMessage('Invalid voucher type'),
    body('template.discount_value').isFloat({ min: 0 }).withMessage('Discount value required'),
    body('template.name').trim().notEmpty().withMessage('Template name required')
  ],
  validate,
  async (req, res, next) => {
    try {
      const { count, prefix = '', template } = req.body;
      
      const vouchers = await voucherService.generateBulkVouchers(
        { count, prefix, template },
        req.user.id
      );
      
      logger.info('Admin generated bulk vouchers', { 
        adminId: req.user.id, 
        count: vouchers.length,
        prefix 
      });
      
      res.status(201).json({
        success: true,
        count: vouchers.length,
        vouchers: vouchers.map(v => ({ id: v.id, code: v.code }))
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/vouchers/:id/assign
 * Assign voucher to user(s)
 */
router.post('/:id/assign',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    param('id').isUUID().withMessage('Invalid voucher ID'),
    body('userIds').isArray({ min: 1 }).withMessage('At least one user ID required'),
    body('userIds.*').isUUID().withMessage('Invalid user ID'),
    body('source').optional().isString()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userIds, source = 'admin' } = req.body;
      const voucherId = req.params.id;
      
      const assignments = await Promise.all(
        userIds.map(userId => 
          voucherService.assignVoucherToUser(voucherId, userId, source)
        )
      );
      
      logger.info('Admin assigned voucher to users', { 
        adminId: req.user.id, 
        voucherId,
        userCount: userIds.length 
      });
      
      res.json({
        success: true,
        assignments
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/vouchers/:id/redemptions
 * Get redemption history for a voucher
 */
router.get('/:id/redemptions',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    param('id').isUUID().withMessage('Invalid voucher ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      const redemptions = await voucherService.getVoucherRedemptions(req.params.id);
      
      res.json({
        success: true,
        redemptions
      });
      
    } catch (error) {
      next(error);
    }
  }
);

// ============ CAMPAIGN ENDPOINTS ============

/**
 * POST /api/vouchers/campaigns
 * Create a campaign
 */
router.post('/campaigns',
  authenticateJWT,
  authorizeRoles(['admin']),
  [
    body('name').trim().notEmpty().isLength({ max: 255 }).withMessage('Name is required'),
    body('description').optional().isString(),
    body('start_date').optional().isISO8601(),
    body('end_date').optional().isISO8601(),
    body('budget').optional().isFloat({ min: 0 })
  ],
  validate,
  async (req, res, next) => {
    try {
      const campaign = await voucherService.createCampaign(req.body, req.user.id);
      
      res.status(201).json({
        success: true,
        campaign
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/vouchers/campaigns
 * List campaigns
 */
router.get('/campaigns',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res, next) => {
    try {
      const { pool } = await import('../db.js');
      
      const result = await pool.query(
        `SELECT c.*, 
                COUNT(DISTINCT v.id) as voucher_count,
                u.first_name || ' ' || u.last_name as created_by_name
         FROM voucher_campaigns c
         LEFT JOIN voucher_codes v ON v.campaign_id = c.id
         LEFT JOIN users u ON c.created_by = u.id
         GROUP BY c.id, u.first_name, u.last_name
         ORDER BY c.created_at DESC`
      );
      
      res.json({
        success: true,
        campaigns: result.rows
      });
      
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/vouchers/campaigns/:id
 * Get campaign with statistics
 */
router.get('/campaigns/:id',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  [
    param('id').isUUID().withMessage('Invalid campaign ID')
  ],
  validate,
  async (req, res, next) => {
    try {
      const campaign = await voucherService.getCampaignStats(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Campaign not found'
        });
      }
      
      res.json({
        success: true,
        campaign
      });
      
    } catch (error) {
      next(error);
    }
  }
);

export default router;
