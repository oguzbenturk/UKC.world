/**
 * Waiver Routes
 * 
 * Endpoints for digital signature submission, waiver status checks, and template retrieval
 * 
 * Routes:
 * - POST /submit - Submit a new waiver signature
 * - GET /status/:userId - Check waiver status for user or family member
 * - GET /template/:versionId? - Get waiver template (latest or specific version)
 * - GET /check/:userId - Check if user needs to sign waiver (for middleware use)
 */

import express from 'express';
import { body, param, query } from 'express-validator';
import * as waiverService from '../services/waiverService.js';
import { validateInput } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import {
  logWaiverView
} from '../services/auditLogService.js';
import {
  dispatchWaiverPendingReminder
} from '../services/waiverNotificationService.js';

const router = express.Router();

const submitWaiverValidation = [
  body('user_id')
    .optional()
    .isUUID()
    .withMessage('user_id must be a valid UUID'),
  body('family_member_id')
    .optional()
    .isUUID()
    .withMessage('family_member_id must be a valid UUID'),
  body('waiver_version')
    .trim()
    .notEmpty()
    .withMessage('waiver_version is required')
    .isLength({ max: 20 })
    .withMessage('waiver_version must be 20 characters or less'),
  body('language_code')
    .trim()
    .notEmpty()
    .withMessage('language_code is required')
    .isLength({ max: 10 })
    .withMessage('language_code must be 10 characters or less'),
  body('signature_data')
    .trim()
    .notEmpty()
    .withMessage('signature_data is required')
    .matches(/^data:image\/(png|jpeg);base64,/)
    .withMessage('signature_data must be a valid base64 encoded image (PNG or JPEG)'),
  body('agreed_to_terms')
    .isBoolean()
    .withMessage('agreed_to_terms must be a boolean')
    .custom((value) => {
      if (value !== true) {
        throw new Error('You must agree to the terms to submit the waiver');
      }
      return true;
    }),
  body('photo_consent')
    .optional()
    .isBoolean()
    .withMessage('photo_consent must be a boolean'),
];

const statusValidation = [
  param('userId')
    .isUUID()
    .withMessage('userId must be a valid UUID'),
  query('type')
    .optional()
    .isIn(['user', 'family_member'])
    .withMessage('type must be either "user" or "family_member"'),
];

const templateVersionValidation = [
  param('versionId')
    .isUUID()
    .withMessage('versionId must be a valid UUID'),
  query('language')
    .optional()
    .isLength({ max: 10 })
    .withMessage('language must be 10 characters or less'),
];

const templateLatestValidation = [
  query('language')
    .optional()
    .isLength({ max: 10 })
    .withMessage('language must be 10 characters or less'),
];

const historyValidation = [
  param('userId')
    .isUUID()
    .withMessage('userId must be a valid UUID'),
  query('type')
    .optional()
    .isIn(['user', 'family_member'])
    .withMessage('type must be either "user" or "family_member"'),
];

/**
 * POST /api/waivers/submit
 * Submit a new liability waiver with digital signature
 * 
 * Body:
 * - user_id: UUID (optional, required if no family_member_id)
 * - family_member_id: UUID (optional, required if no user_id)
 * - waiver_version: string (e.g., "1.0")
 * - language_code: string (e.g., "en")
 * - signature_data: string (base64 encoded PNG image)
 * - agreed_to_terms: boolean (must be true)
 * - photo_consent: boolean (optional)
 */
router.post(
  '/submit',
  authenticateJWT,
  validateInput(submitWaiverValidation),
  async (req, res, next) => {
    try {
      const { user_id, family_member_id, waiver_version, language_code, signature_data, agreed_to_terms, photo_consent } = req.body;

      // Ensure exactly one of user_id or family_member_id is provided
      if ((!user_id && !family_member_id) || (user_id && family_member_id)) {
        return res.status(400).json({
          success: false,
          message: 'You must provide either user_id OR family_member_id, not both or neither',
        });
      }

      // Capture IP address and user agent
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Get authenticated user ID (the person actually signing)
      const signerUserId = req.user.id;

      // Submit waiver
      const waiver = await waiverService.submitWaiver({
        user_id,
        family_member_id,
        signer_user_id: signerUserId,
        waiver_version,
        language_code,
        signature_data,
        ip_address: ipAddress,
        user_agent: userAgent,
        agreed_to_terms,
        photo_consent: photo_consent || false,
      });

      res.status(201).json({
        success: true,
        message: 'Waiver submitted successfully',
        data: waiver,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/waivers/status/:userId
 * Check waiver status for a user or family member
 * 
 * Query params:
 * - type: 'user' | 'family_member' (default: 'user')
 */
router.get(
  '/status/:userId',
  authenticateJWT,
  validateInput(statusValidation),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const type = req.query.type || 'user';

      // Check if user has permission to view this waiver status
      // Students can only view their own status or their family members
      // Admins/managers can view any status
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      if (
        requestingUserRole !== 'admin' &&
        requestingUserRole !== 'manager' &&
        requestingUserRole !== 'owner' &&
        type === 'user' &&
        userId !== requestingUserId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this waiver status',
        });
      }

      const status = await waiverService.checkWaiverStatus(userId, type);

      if (
        status?.needsToSign &&
        !['admin', 'manager', 'owner'].includes(requestingUserRole)
      ) {
        const reminderScope = type === 'family_member' ? `family-member:${userId}` : 'user';
        const reminderMessage = status.isExpired
          ? 'Your waiver has expired. Please sign the latest version to keep booking lessons.'
          : status.message || 'Please complete your liability waiver to keep booking lessons.';

        dispatchWaiverPendingReminder({
          userId: requestingUserId,
          scope: reminderScope,
          latestVersion: status.latestVersion || status.currentVersion || 'latest',
          message: reminderMessage
        }).catch((reminderError) => {
          console.warn('Failed to enqueue waiver pending reminder', reminderError?.message || reminderError);
        });
      }

      if (['admin', 'manager', 'owner'].includes(requestingUserRole) && status?.currentWaiverId) {
        try {
          await logWaiverView({
            actorUserId: requestingUserId,
            targetUserId: type === 'user' ? userId : null,
            familyMemberId: type === 'family_member' ? userId : null,
            waiverId: status.currentWaiverId,
            metadata: {
              viewScope: 'status',
              requestedType: type
            },
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
            userAgent: req.headers['user-agent'] || 'Unknown'
          });
        } catch (auditError) {
          console.warn('Failed to log waiver status view audit event', auditError.message);
        }
      }

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/waivers/template/:versionId
 * Get specific waiver template version
 * 
 * Query params:
 * - language: string (default: 'en')
 */
router.get(
  '/template/:versionId',
  validateInput(templateVersionValidation),
  async (req, res, next) => {
    try {
      const { versionId } = req.params;

      const template = await waiverService.getWaiverVersion(versionId);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Waiver template not found',
        });
      }

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/waivers/template
 * Get latest active waiver template
 * 
 * Query params:
 * - language: string (default: 'en')
 */
router.get(
  '/template',
  validateInput(templateLatestValidation),
  async (req, res, next) => {
    try {
      const language = req.query.language || 'en';

      const template = await waiverService.getLatestActiveVersion(language);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Waiver template not found',
        });
      }

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/waivers/check/:userId
 * Check if user/family member needs to sign waiver
 * Simplified endpoint for middleware use
 * 
 * Query params:
 * - type: 'user' | 'family_member' (default: 'user')
 */
router.get(
  '/check/:userId',
  authenticateJWT,
  validateInput(statusValidation),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const type = req.query.type || 'user';

      const needsWaiver = await waiverService.needsToSignWaiver(userId, type);

      res.status(200).json({
        success: true,
        needsWaiver,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/waivers/history/:userId
 * Get all waiver signatures for a user (admin only or own history)
 * 
 * Query params:
 * - type: 'user' | 'family_member' (default: 'user')
 */
router.get(
  '/history/:userId',
  authenticateJWT,
  validateInput(historyValidation),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const type = req.query.type || 'user';

      // Check permissions (same as status endpoint)
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      if (
        requestingUserRole !== 'admin' &&
        requestingUserRole !== 'manager' &&
        requestingUserRole !== 'owner' &&
        type === 'user' &&
        userId !== requestingUserId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this waiver history',
        });
      }

      const history = await waiverService.getWaiverHistory(userId, type);

      if (['admin', 'manager', 'owner'].includes(requestingUserRole) && history.length > 0) {
        try {
          await logWaiverView({
            actorUserId: requestingUserId,
            targetUserId: type === 'user' ? userId : null,
            familyMemberId: type === 'family_member' ? userId : null,
            waiverId: history[0]?.id || null,
            metadata: {
              viewScope: 'history',
              requestedType: type,
              count: history.length
            },
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
            userAgent: req.headers['user-agent'] || 'Unknown'
          });
        } catch (auditError) {
          console.warn('Failed to log waiver history view audit event', auditError.message);
        }
      }

      res.status(200).json({
        success: true,
        count: history.length,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
