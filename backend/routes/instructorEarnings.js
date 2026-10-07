// Instructor self-service earnings + payout requests.
// Mounted by routes/instructor.js under /me → /api/instructors/me/* (authenticateJWT
// is applied where instructor.js is mounted in server.js). Every handler scopes to
// req.user.id — an instructor can only ever read/touch their own data.
// Spec: docs/specs/instructor-earnings-payouts.md §2 "Instructor".

import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import {
  getEarningsSummary,
  getEarningsActivity,
  getEarningsStatementCsv,
  listOwnRequests,
  createPayoutRequest,
  cancelPayoutRequest,
  PERIOD_KEYS,
  ACTIVITY_TYPES,
  ACTIVITY_STATUSES,
} from '../services/instructorPayoutService.js';

const router = express.Router();
const EARNER_ROLES = ['instructor', 'manager'];

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

// Payout requests notify every admin/manager (in-app + Telegram) — cap how often
// one user can create/cancel them.
const payoutWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `payout:${req.user?.id || 'anon'}`,
  message: { error: 'Too many payout request actions. Please try again later.', code: 'RATE_LIMITED' },
});

const periodQuery = query('period')
  .optional()
  .isIn(PERIOD_KEYS)
  .withMessage(`period must be one of ${PERIOD_KEYS.join(', ')}`);

/** GET /api/instructors/me/earnings-summary?period=week|month|year|all */
router.get('/earnings-summary',
  authorizeRoles(EARNER_ROLES),
  periodQuery,
  validate,
  async (req, res) => {
    try {
      res.json(await getEarningsSummary(req.user.id, { period: req.query.period || 'month' }));
    } catch (error) {
      sendError(res, error, 'Failed to load earnings summary');
    }
  });

/** GET /api/instructors/me/earnings-activity?period=&type=all|lessons|payouts&status=all|pending|paid&search=&limit=50&offset=0 */
router.get('/earnings-activity',
  authorizeRoles(EARNER_ROLES),
  periodQuery,
  query('type').optional().isIn(ACTIVITY_TYPES).withMessage(`type must be one of ${ACTIVITY_TYPES.join(', ')}`),
  query('status').optional().isIn(ACTIVITY_STATUSES).withMessage(`status must be one of ${ACTIVITY_STATUSES.join(', ')}`),
  query('search').optional().isString().isLength({ max: 100 }).withMessage('search is too long'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be >= 0'),
  validate,
  async (req, res) => {
    try {
      res.json(await getEarningsActivity(req.user.id, {
        period: req.query.period || 'month',
        type: req.query.type || 'all',
        status: req.query.status || 'all',
        search: req.query.search || '',
        // Express 5's req.query is re-parsed on every access, so validator
        // sanitizers (toInt) do not stick — parse explicitly.
        limit: req.query.limit === undefined ? 50 : Number.parseInt(req.query.limit, 10),
        offset: req.query.offset === undefined ? 0 : Number.parseInt(req.query.offset, 10),
      }));
    } catch (error) {
      sendError(res, error, 'Failed to load earnings activity');
    }
  });

/**
 * GET /api/instructors/me/earnings-statement?month=YYYY-MM&format=csv
 * CSV only for now — `format=pdf` answers 400 (code FORMAT_NOT_SUPPORTED) so the UI
 * hides the PDF option, as the spec allows.
 */
router.get('/earnings-statement',
  authorizeRoles(EARNER_ROLES),
  query('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('month must be YYYY-MM'),
  query('format').optional().isIn(['csv', 'pdf']).withMessage('format must be csv or pdf'),
  validate,
  async (req, res) => {
    if ((req.query.format || 'csv') === 'pdf') {
      return res.status(400).json({ error: 'PDF statements are not available yet; use format=csv', code: 'FORMAT_NOT_SUPPORTED', supportedFormats: ['csv'] });
    }
    try {
      const csv = await getEarningsStatementCsv(req.user.id, { month: req.query.month });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="earnings-statement-${req.query.month}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(csv);
    } catch (error) {
      return sendError(res, error, 'Failed to build earnings statement');
    }
  });

/** GET /api/instructors/me/payout-requests → own requests, newest first */
router.get('/payout-requests',
  authorizeRoles(EARNER_ROLES),
  async (req, res) => {
    try {
      res.json(await listOwnRequests(req.user.id));
    } catch (error) {
      sendError(res, error, 'Failed to load payout requests');
    }
  });

/** POST /api/instructors/me/payout-requests { amount, preferredMethod?, note? } */
router.post('/payout-requests',
  authorizeRoles(EARNER_ROLES),
  payoutWriteLimiter,
  body('amount').exists({ values: 'null' }).withMessage('amount is required')
    .bail()
    .isFloat({ gt: 0, max: 1000000 }).withMessage('amount must be greater than 0'),
  body('preferredMethod').optional({ values: 'null' }).isString().trim().isLength({ max: 32 }).withMessage('preferredMethod is too long'),
  body('note').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }).withMessage('note must be at most 500 characters'),
  validate,
  async (req, res) => {
    try {
      const created = await createPayoutRequest({
        instructorId: req.user.id,
        amount: req.body.amount,
        preferredMethod: req.body.preferredMethod || null,
        note: req.body.note || null,
      });
      res.status(201).json(created);
    } catch (error) {
      sendError(res, error, 'Failed to create payout request');
    }
  });

/** DELETE /api/instructors/me/payout-requests/:id → cancel own pending request */
router.delete('/payout-requests/:id',
  authorizeRoles(EARNER_ROLES),
  payoutWriteLimiter,
  param('id').isUUID().withMessage('Invalid payout request id'),
  validate,
  async (req, res) => {
    try {
      res.json(await cancelPayoutRequest({ instructorId: req.user.id, requestId: req.params.id }));
    } catch (error) {
      sendError(res, error, 'Failed to cancel payout request');
    }
  });

export default router;
