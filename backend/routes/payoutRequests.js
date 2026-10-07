// Admin / manager side of instructor payout requests.
// Mounted at /api/finances/payout-requests (authenticateJWT applied in server.js).
// Spec: docs/specs/instructor-earnings-payouts.md §2 "Admin / manager".

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import { resolveActorId } from '../utils/auditUtils.js';
import {
  listPayoutRequests,
  countPayoutRequests,
  payPayoutRequest,
  rejectPayoutRequest,
  REQUEST_STATUSES,
} from '../services/instructorPayoutService.js';

const router = express.Router();
const STAFF_ROLES = ['admin', 'manager'];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, code: 'VALIDATION_ERROR', details: errors.array() });
  }
  return next();
};

const sendError = (res, error, fallback) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  logger.error(fallback, { error: error?.message, stack: error?.stack });
  return res.status(500).json({ error: fallback });
};

const statusQuery = () => query('status')
  .optional()
  .isIn([...REQUEST_STATUSES, 'all'])
  .withMessage(`status must be one of ${[...REQUEST_STATUSES, 'all'].join(', ')}`);

/** GET /api/finances/payout-requests/count?status=pending → { count } */
router.get('/count',
  authorizeRoles(STAFF_ROLES),
  statusQuery(),
  validate,
  async (req, res) => {
    try {
      const count = await countPayoutRequests({ status: req.query.status || 'pending' });
      res.json({ count });
    } catch (error) {
      sendError(res, error, 'Failed to count payout requests');
    }
  });

/** GET /api/finances/payout-requests?status=… → list (pending first, then newest) */
router.get('/',
  authorizeRoles(STAFF_ROLES),
  statusQuery(),
  validate,
  async (req, res) => {
    try {
      res.json(await listPayoutRequests({ status: req.query.status || 'all' }));
    } catch (error) {
      sendError(res, error, 'Failed to load payout requests');
    }
  });

/** POST /api/finances/payout-requests/:id/pay { amount?, paymentMethod, referenceNumber?, note? } */
router.post('/:id/pay',
  authorizeRoles(STAFF_ROLES),
  param('id').isUUID().withMessage('Invalid payout request id'),
  body('amount').optional({ values: 'null' }).isFloat({ gt: 0, max: 1000000 }).withMessage('amount must be a positive number'),
  body('paymentMethod').isString().trim().isLength({ min: 1, max: 32 }).withMessage('paymentMethod is required'),
  body('referenceNumber').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('referenceNumber is too long'),
  body('note').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }).withMessage('note must be at most 500 characters'),
  validate,
  async (req, res) => {
    try {
      const { amount, paymentMethod, referenceNumber, note } = req.body;
      const result = await payPayoutRequest({
        requestId: req.params.id,
        actorId: resolveActorId(req),
        amount,
        paymentMethod,
        referenceNumber: referenceNumber || null,
        note: note || null,
      });
      res.json(result.request);
    } catch (error) {
      sendError(res, error, 'Failed to pay payout request');
    }
  });

/** POST /api/finances/payout-requests/:id/reject { reason } */
router.post('/:id/reject',
  authorizeRoles(STAFF_ROLES),
  param('id').isUUID().withMessage('Invalid payout request id'),
  body('reason').isString().trim().isLength({ min: 1, max: 500 }).withMessage('reason is required (max 500 characters)'),
  validate,
  async (req, res) => {
    try {
      const updated = await rejectPayoutRequest({
        requestId: req.params.id,
        actorId: resolveActorId(req),
        reason: req.body.reason,
      });
      res.json(updated);
    } catch (error) {
      sendError(res, error, 'Failed to reject payout request');
    }
  });

export default router;
