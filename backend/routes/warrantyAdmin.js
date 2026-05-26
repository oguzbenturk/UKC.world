import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import * as warrantyService from '../services/warrantyService.js';
import * as media from '../services/warrantyMediaService.js';
import * as notify from '../services/warrantyNotificationService.js';
import { logAuditEvent } from '../services/auditLogService.js';

const router = express.Router();

// Every admin route is JWT-protected and limited to admin/manager (owners
// inherit through the existing authorizeRoles helper).
router.use(authenticateJWT, authorizeRoles(['admin', 'manager']));

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function audit(action, claimId, req, metadata = {}) {
  return logAuditEvent({
    eventType: `warranty.${action}`,
    action,
    resourceType: 'warranty_claim',
    resourceId: claimId,
    actorUserId: req.user?.id || null,
    metadata,
    ipAddress: req.ip || null,
    userAgent: req.get('User-Agent') || null
  });
}

// ─── List & stats ────────────────────────────────────────────────────────────

router.get(
  '/',
  [
    query('status').optional().isString(),
    query('q').optional().isString().isLength({ max: 200 }),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isIn(['created_desc', 'created_asc'])
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const result = await warrantyService.listClaims({
        status: req.query.status || null,
        q: req.query.q || null,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.pageSize) || 25,
        sort: req.query.sort || 'created_desc'
      });
      return res.json(result);
    } catch (err) {
      logger.error('warrantyAdmin list failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to list warranty claims' });
    }
  }
);

router.get('/stats', async (_req, res) => {
  try {
    const stats = await warrantyService.getStatsForAdmin();
    return res.json(stats);
  } catch (err) {
    logger.error('warrantyAdmin stats failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to load warranty stats' });
  }
});

// ─── Per-claim detail ────────────────────────────────────────────────────────

router.get('/:id', param('id').isUUID(), async (req, res) => {
  if (sendValidationErrors(req, res)) return;
  const claim = await warrantyService.getClaimById(req.params.id);
  if (!claim) return res.status(404).json({ error: 'Warranty claim not found' });
  const [events, mediaItems, staffLinks] = await Promise.all([
    warrantyService.getClaimEvents(claim.id),
    warrantyService.listClaimMedia(claim.id),
    warrantyService.listStaffLinks(claim.id, { includeRevoked: true })
  ]);
  return res.json({ claim, events, media: mediaItems, staffLinks });
});

router.patch(
  '/:id/status',
  param('id').isUUID(),
  [
    body('status').isString().custom((v) => warrantyService.ALL_STATUSES.includes(v)),
    body('note').optional({ checkFalsy: true }).isString().isLength({ max: 3000 })
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const result = await warrantyService.updateClaimStatus(
        req.params.id,
        req.body.status,
        {
          actorKind: 'admin',
          actorUserId: req.user.id,
          note: req.body.note || null
        }
      );
      audit('status_change', req.params.id, req, {
        from: result.previous, to: result.next, note: req.body.note || null
      });
      notify.notifyStatusChangeToCustomer(result.claim, {
        previous: result.previous,
        next: result.next,
        note: req.body.note || null
      }).catch((err) =>
        logger.warn('Warranty: status email failed', { claimId: result.claim.id, error: err.message })
      );
      return res.json(result.claim);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.post(
  '/:id/notes',
  param('id').isUUID(),
  [
    body('body').isString().trim().isLength({ min: 1, max: 3000 }),
    body('visible_to_customer').isBoolean()
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const event = await warrantyService.addNote(req.params.id, {
        body: req.body.body,
        visibleToCustomer: Boolean(req.body.visible_to_customer),
        actorKind: 'admin',
        actorUserId: req.user.id
      });
      audit('note_added', req.params.id, req, {
        visible_to_customer: Boolean(req.body.visible_to_customer)
      });
      return res.status(201).json(event);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.post(
  '/:id/customer-update',
  param('id').isUUID(),
  [body('body').isString().trim().isLength({ min: 1, max: 3000 })],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const { event, claim } = await warrantyService.addCustomerUpdate(req.params.id, {
        body: req.body.body,
        actorUserId: req.user.id
      });
      audit('customer_update_sent', req.params.id, req);
      notify.notifyCustomerUpdate(claim, { body: req.body.body }).catch((err) =>
        logger.warn('Warranty: customer update email failed', { error: err.message })
      );
      return res.status(201).json(event);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.post(
  '/:id/resend-customer-link',
  param('id').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const claim = await warrantyService.getClaimById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Warranty claim not found' });
    await warrantyService.logLinkResent(claim.id, { actorUserId: req.user.id, target: 'customer' });
    audit('link_resent', req.params.id, req, { target: 'customer' });
    notify.resendCustomerLink(claim).catch((err) =>
      logger.warn('Warranty: resend customer link email failed', { error: err.message })
    );
    return res.json({ ok: true });
  }
);

router.post(
  '/:id/close',
  param('id').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const claim = await warrantyService.closeClaim(req.params.id, { actorUserId: req.user.id });
      audit('claim_closed', req.params.id, req);
      notify.notifyClaimClosedToCustomer(claim).catch((err) =>
        logger.warn('Warranty: closed email failed', { error: err.message })
      );
      return res.json(claim);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.delete(
  '/:id',
  param('id').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const claim = await warrantyService.softDeleteClaim(req.params.id, { actorUserId: req.user.id });
      await media.purgeClaimFiles(claim.id);
      audit('claim_deleted', req.params.id, req);
      return res.status(204).end();
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.delete(
  '/:id/media/:mediaId',
  [param('id').isUUID(), param('mediaId').isUUID()],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const item = await warrantyService.getMediaById(req.params.mediaId);
      if (!item || item.claim_id !== req.params.id) {
        return res.status(404).json({ error: 'Media not found' });
      }
      const removed = await warrantyService.detachMediaRecord(req.params.mediaId, {
        actorUserId: req.user.id, actorKind: 'admin'
      });
      await media.deleteMediaFile(removed.storage_path);
      audit('media_deleted', req.params.id, req, {
        media_id: removed.id, kind: removed.kind, original_name: removed.original_name
      });
      return res.status(204).end();
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// ─── Staff links ─────────────────────────────────────────────────────────────

router.post(
  '/:id/staff-links',
  param('id').isUUID(),
  [
    body('staff_name').isString().trim().isLength({ min: 1, max: 120 }),
    body('staff_email').isString().trim().isEmail().isLength({ max: 200 }),
    body('staff_user_id').optional({ checkFalsy: true }).isUUID()
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const link = await warrantyService.createStaffLink(req.params.id, {
        staffName: req.body.staff_name,
        staffEmail: req.body.staff_email,
        staffUserId: req.body.staff_user_id || null,
        createdByUserId: req.user.id
      });
      const claim = await warrantyService.getClaimById(req.params.id);
      audit('staff_link_created', req.params.id, req, { staff_link_id: link.id });
      notify.notifyStaffLinkSent(claim, link).catch((err) =>
        logger.warn('Warranty: staff invite email failed', { error: err.message })
      );
      return res.status(201).json(link);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.delete(
  '/:id/staff-links/:linkId',
  [param('id').isUUID(), param('linkId').isUUID()],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const link = await warrantyService.revokeStaffLink(req.params.linkId, {
        actorUserId: req.user.id
      });
      audit('staff_link_revoked', req.params.id, req, { staff_link_id: link.id });
      return res.status(204).end();
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

export default router;
