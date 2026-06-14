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

// ─── Admin-initiated claim creation ──────────────────────────────────────────
//
// Lets an admin log a warranty claim on behalf of a customer (e.g. when the
// customer walks in or rings the shop). Accepts the same fields as the public
// route plus an optional external_claim_number that staff may already have
// from the manufacturer. Files can be attached the same way as the public
// submit. The customer still receives the standard tracking-link email so
// they can follow the case online.

const adminCreateUpload = (req, res, next) =>
  media.handleMulterError(
    media.claimMediaUpload.array('files', media.MAX_FILES_PER_REQUEST),
    { requireFile: false }
  )(req, res, next);

router.post(
  '/',
  adminCreateUpload,
  [
    body('customer_name').isString().trim().isLength({ min: 2, max: 120 }),
    body('customer_email').isString().trim().isEmail().isLength({ max: 200 }),
    body('customer_phone').optional({ checkFalsy: true }).isString().isLength({ max: 50 }),
    body('product_name').isString().trim().isLength({ min: 1, max: 200 }),
    body('product_brand').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('product_model').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('product_serial').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('purchase_location').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
    body('issue_description').isString().trim().isLength({ min: 5, max: 5000 }),
    body('preferred_language').optional().isIn(['tr', 'en']),
    body('external_claim_number').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('notify_customer').optional().isIn(['true', 'false', '0', '1'])
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) {
      await media.purgePendingFiles(req.files || []);
      return;
    }

    const uploadedFiles = req.files || [];
    const fileCheck = media.validateUploadedFiles(uploadedFiles);
    if (!fileCheck.ok) {
      await media.purgePendingFiles(uploadedFiles);
      return res.status(fileCheck.status).json({ error: fileCheck.error, code: fileCheck.code });
    }

    const parseDateOrNull = (value) => {
      if (!value) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    };

    let claim;
    try {
      claim = await warrantyService.createClaim({
        customer_name: req.body.customer_name.trim(),
        customer_email: req.body.customer_email.trim().toLowerCase(),
        customer_phone: req.body.customer_phone?.trim() || null,
        product_name: req.body.product_name.trim(),
        product_brand: req.body.product_brand?.trim() || null,
        product_model: req.body.product_model?.trim() || null,
        product_serial: req.body.product_serial?.trim() || null,
        purchase_date: parseDateOrNull(req.body.purchase_date),
        purchase_location: req.body.purchase_location?.trim() || null,
        issue_description: req.body.issue_description.trim(),
        preferred_language: req.body.preferred_language === 'tr' ? 'tr' : 'en',
        external_claim_number: req.body.external_claim_number?.trim() || null,
        source: 'admin',
        actor_user_id: req.user.id,
        submitted_ip: req.ip || null,
        submitted_user_agent: req.get('User-Agent') || null
      });
    } catch (err) {
      logger.error('Warranty: admin createClaim failed', { error: err.message });
      await media.purgePendingFiles(uploadedFiles);
      return res.status(500).json({ error: 'Could not create warranty claim.' });
    }

    if (uploadedFiles.length > 0) {
      try {
        const moved = await media.relocatePendingFilesToClaim(uploadedFiles, claim.id);
        for (const m of moved) {
          await warrantyService.attachMediaRecord({
            claimId: claim.id,
            kind: m.kind,
            filename: m.filename,
            originalName: m.originalName,
            sizeBytes: m.sizeBytes,
            mimeType: m.mimeType,
            storagePath: m.storagePath,
            uploadedByKind: 'admin',
            uploadedByUserId: req.user.id
          });
        }
      } catch (err) {
        logger.error('Warranty: admin upload attach failed', {
          claimId: claim.id, error: err.message
        });
        await media.purgePendingFiles(uploadedFiles);
      }
    }

    const refreshed = await warrantyService.getClaimById(claim.id);

    audit('claim_created_by_admin', refreshed.id, req, {
      external_claim_number: refreshed.external_claim_number || null,
      file_count: uploadedFiles.length
    });

    // Default: notify customer with tracking link. Admin may suppress by
    // passing notify_customer=false (e.g. recording a closed historical case).
    const notifyCustomer = !(req.body.notify_customer === 'false' || req.body.notify_customer === '0');
    if (notifyCustomer) {
      notify.notifyClaimSubmittedToCustomer(refreshed).catch((err) =>
        logger.warn('Warranty: customer email failed (admin create)', { error: err.message })
      );
    }

    return res.status(201).json(refreshed);
  }
);

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
      // Customer gets the status email; assigned staff + admins get the bundled
      // activity digest (excluding the admin who made this change).
      notify.queueClaimActivityDigest(req.params.id);
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
      notify.queueClaimActivityDigest(req.params.id);
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
      notify.queueClaimActivityDigest(req.params.id);
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
      notify.queueClaimActivityDigest(req.params.id);
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
      notify.queueClaimActivityDigest(req.params.id);
      return res.status(204).end();
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// ─── Manufacturer claim number (admin override) ──────────────────────────────
//
// Admins can set or correct the manufacturer claim number even when a staff
// member set it first (the staff portal locks it to whoever entered it). This
// reassigns ownership to the admin and locks staff out until an admin changes
// it again. The override is recorded in the timeline.

router.patch(
  '/:id/claim-number',
  param('id').isUUID(),
  [body('claim_number_external').isString().trim().isLength({ min: 1, max: 120 })],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const result = await warrantyService.setAdminClaimNumber(req.params.id, {
        claimNumberExternal: req.body.claim_number_external,
        actorUserId: req.user.id
      });
      audit('claim_number_set', req.params.id, req, {
        claim_number_external: req.body.claim_number_external.trim(),
        overrode: result.overrode
      });
      notify.queueClaimActivityDigest(req.params.id);
      return res.json(result.claim);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// ─── Media ZIP export ─────────────────────────────────────────────────────────
//
// Streams every photo/video on the claim as a single ZIP, foldered by uploader
// (Customer/ vs Team/) with a manifest.csv preserving the exact role + name.

router.get(
  '/:id/media/archive',
  param('id').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const claim = await warrantyService.getClaimById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Warranty claim not found' });
    const mediaItems = await warrantyService.listClaimMedia(claim.id);
    if (!mediaItems.length) {
      return res.status(404).json({ error: 'No media to download' });
    }
    audit('media_archive_downloaded', req.params.id, req, { count: mediaItems.length });
    return media.streamClaimMediaArchive(res, { claim, media: mediaItems });
  }
);

// ─── Add media to an existing claim ──────────────────────────────────────────
//
// Until now an admin could only attach files at claim-creation time. This lets
// an admin add photos, videos OR the PDF "Product Bill" to a claim already in
// flight (e.g. when the manufacturer asks for the purchase invoice). Mirrors
// the staff /files route but attributes the upload to the acting admin.

const adminMediaUpload = (req, res, next) =>
  media.handleMulterError(
    media.claimMediaUpload.array('files', media.MAX_FILES_PER_REQUEST),
    { requireFile: false }
  )(req, res, next);

router.post(
  '/:id/media',
  param('id').isUUID(),
  adminMediaUpload,
  async (req, res) => {
    if (sendValidationErrors(req, res)) {
      await media.purgePendingFiles(req.files || []);
      return;
    }
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const claim = await warrantyService.getClaimById(req.params.id);
    if (!claim) {
      await media.purgePendingFiles(uploadedFiles);
      return res.status(404).json({ error: 'Warranty claim not found' });
    }
    const check = media.validateUploadedFiles(uploadedFiles, {
      existingPhotoCount: claim.photo_count,
      existingVideoCount: claim.video_count,
      existingDocumentCount: claim.document_count,
      existingTotalBytes: Number(claim.total_bytes) || 0
    });
    if (!check.ok) {
      await media.purgePendingFiles(uploadedFiles);
      return res.status(check.status).json({ error: check.error, code: check.code });
    }
    try {
      const moved = await media.relocatePendingFilesToClaim(uploadedFiles, claim.id);
      const attached = [];
      for (const m of moved) {
        const record = await warrantyService.attachMediaRecord({
          claimId: claim.id,
          kind: m.kind,
          filename: m.filename,
          originalName: m.originalName,
          sizeBytes: m.sizeBytes,
          mimeType: m.mimeType,
          storagePath: m.storagePath,
          uploadedByKind: 'admin',
          uploadedByUserId: req.user.id
        });
        attached.push(record);
      }
      audit('media_uploaded', claim.id, req, {
        count: attached.length, kinds: attached.map((a) => a.kind)
      });
      notify.queueClaimActivityDigest(claim.id);
      return res.status(201).json({ uploaded: attached });
    } catch (err) {
      logger.error('Warranty: admin upload failed', { claimId: claim.id, error: err.message });
      await media.purgePendingFiles(uploadedFiles);
      return res.status(500).json({ error: 'Failed to attach files' });
    }
  }
);

// Serve a single media file to an authenticated admin. Photos/videos are
// normally rendered via the customer-token URL (works in <img>/<video>), but
// documents are team-internal and blocked on that public surface — so the admin
// dashboard fetches them here (JWT-protected) as a blob. Registered AFTER
// /:id/media/archive so the literal "archive" segment is not captured as
// :mediaId.
router.get(
  '/:id/media/:mediaId',
  [param('id').isUUID(), param('mediaId').isUUID()],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const item = await warrantyService.getMediaById(req.params.mediaId);
    if (!item || item.claim_id !== req.params.id) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const abs = media.absoluteMediaPath(item.storage_path);
    if (!abs) return res.status(404).json({ error: 'Media not found' });
    res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.original_name)}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Media not found' });
    });
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
      // Tell existing staff + admins a new member joined; the invitee gets their
      // own portal link via notifyStaffLinkSent.
      notify.queueClaimActivityDigest(req.params.id);
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
      notify.queueClaimActivityDigest(req.params.id);
      return res.status(204).end();
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

export default router;
