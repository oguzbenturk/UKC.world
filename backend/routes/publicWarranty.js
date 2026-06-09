import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { logger } from '../middlewares/errorHandler.js';
import { formSubmissionRateLimit, warrantyLookupRateLimit } from '../middlewares/security.js';
import * as warrantyService from '../services/warrantyService.js';
import * as media from '../services/warrantyMediaService.js';
import * as notify from '../services/warrantyNotificationService.js';

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOKEN_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function isValidToken(value) {
  return typeof value === 'string' && TOKEN_REGEX.test(value);
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function parseLanguage(value) {
  const lang = (value || '').toLowerCase();
  return lang === 'tr' ? 'tr' : 'en';
}

function parseDateOrNull(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Apply multer to multipart but only if a body actually contains files —
// callers always submit with multipart/form-data when uploading.
const acceptUploads = (req, res, next) =>
  media.handleMulterError(media.claimMediaUpload.array('files', media.MAX_FILES_PER_REQUEST), { requireFile: false })(req, res, next);

// ─── Public submission ───────────────────────────────────────────────────────

router.post(
  '/',
  formSubmissionRateLimit,
  acceptUploads,
  [
    body('customer_name').isString().trim().isLength({ min: 2, max: 120 }),
    body('customer_email').isString().trim().isEmail().isLength({ max: 200 }),
    body('customer_phone').optional({ checkFalsy: true }).isString().isLength({ max: 50 }),
    body('product_name').isString().trim().isLength({ min: 1, max: 200 }),
    body('product_brand').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('product_model').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('product_serial').optional({ checkFalsy: true }).isString().isLength({ max: 120 }),
    body('purchase_location').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
    body('issue_description').isString().trim().isLength({ min: 10, max: 5000 }),
    body('preferred_language').optional().isIn(['tr', 'en'])
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) {
      await media.purgePendingFiles(req.files || []);
      return;
    }

    const uploadedFiles = req.files || [];

    // Reject before doing DB work if the upload payload itself is invalid.
    const fileCheck = media.validateUploadedFiles(uploadedFiles);
    if (!fileCheck.ok) {
      await media.purgePendingFiles(uploadedFiles);
      return res.status(fileCheck.status).json({ error: fileCheck.error, code: fileCheck.code });
    }

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
        preferred_language: parseLanguage(req.body.preferred_language),
        submitted_ip: req.ip || req.connection?.remoteAddress || null,
        submitted_user_agent: req.get('User-Agent') || null
      });
    } catch (err) {
      logger.error('Warranty: createClaim failed', { error: err.message });
      await media.purgePendingFiles(uploadedFiles);
      return res.status(500).json({ error: 'Could not register your warranty claim.' });
    }

    let attachedMedia = [];
    if (uploadedFiles.length > 0) {
      try {
        const moved = await media.relocatePendingFilesToClaim(uploadedFiles, claim.id);
        for (const m of moved) {
          const record = await warrantyService.attachMediaRecord({
            claimId: claim.id,
            kind: m.kind,
            filename: m.filename,
            originalName: m.originalName,
            sizeBytes: m.sizeBytes,
            mimeType: m.mimeType,
            storagePath: m.storagePath,
            uploadedByKind: 'customer'
          });
          attachedMedia.push(record);
        }
      } catch (err) {
        logger.error('Warranty: media attach failed after claim create', {
          claimId: claim.id, error: err.message
        });
        await media.purgePendingFiles(uploadedFiles);
      }
    }

    const refreshed = await warrantyService.getClaimById(claim.id);

    // Fire notifications asynchronously — claim creation must not block on them.
    Promise.all([
      notify.notifyClaimSubmittedToCustomer(refreshed),
      notify.notifyClaimSubmittedToAdmins(refreshed)
    ]).catch((err) => logger.warn('Warranty: notification fan-out failed', { error: err.message }));

    return res.status(201).json({
      id: refreshed.id,
      customer_token: refreshed.customer_token,
      status: refreshed.status,
      media: attachedMedia
    });
  }
);

// ─── Customer tracking ───────────────────────────────────────────────────────

const requireValidToken = (req, res, next) => {
  if (!isValidToken(req.params.code)) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
};

router.get(
  '/track/:code',
  warrantyLookupRateLimit,
  requireValidToken,
  async (req, res) => {
    const claim = await warrantyService.getClaimByCustomerToken(req.params.code);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const [events, mediaItems] = await Promise.all([
      warrantyService.getClaimEvents(claim.id, { visibleToCustomerOnly: true }),
      warrantyService.listClaimMedia(claim.id)
    ]);

    return res.json({
      claim: {
        id: claim.id,
        customer_token: claim.customer_token,
        status: claim.status,
        customer_name: claim.customer_name,
        product_name: claim.product_name,
        product_brand: claim.product_brand,
        product_model: claim.product_model,
        product_serial: claim.product_serial,
        purchase_date: claim.purchase_date,
        purchase_location: claim.purchase_location,
        issue_description: claim.issue_description,
        preferred_language: claim.preferred_language,
        photo_count: claim.photo_count,
        video_count: claim.video_count,
        external_claim_number: claim.external_claim_number,
        created_at: claim.created_at,
        updated_at: claim.updated_at,
        closed_at: claim.closed_at
      },
      events,
      // uploaded_by_kind lets the customer gallery group "Your uploads" vs
      // "From the UKC team" — uploader name is intentionally withheld here.
      media: mediaItems.map((m) => ({
        id: m.id,
        kind: m.kind,
        original_name: m.original_name,
        size_bytes: m.size_bytes,
        mime_type: m.mime_type,
        uploaded_by_kind: m.uploaded_by_kind,
        created_at: m.created_at
      }))
    });
  }
);

router.get(
  '/track/:code/media/:mediaId',
  warrantyLookupRateLimit,
  requireValidToken,
  param('mediaId').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const claim = await warrantyService.getClaimByCustomerToken(req.params.code);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const item = await warrantyService.getMediaById(req.params.mediaId);
    if (!item || item.claim_id !== claim.id) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const abs = media.absoluteMediaPath(item.storage_path);
    if (!abs) return res.status(404).json({ error: 'Media not found' });
    res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.original_name)}"`);
    // The helmet defaults set CORP=same-origin, which blocks <img src> when the
    // frontend (e.g. :3000) and backend (:4000) live on different origins. The
    // URL itself carries the auth (UUID + token), so it is safe to override.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(abs, (err) => {
      if (err) {
        logger.warn('Warranty media send failed', { mediaId: item.id, error: err.message });
        if (!res.headersSent) res.status(404).json({ error: 'Media not found' });
      }
    });
  }
);

// ─── Staff portal ────────────────────────────────────────────────────────────

const loadStaffLinkByToken = async (req, res, next) => {
  if (!isValidToken(req.params.code)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const link = await warrantyService.getStaffLinkByToken(req.params.code);
  if (!link) return res.status(404).json({ error: 'Staff link not found' });
  const claim = await warrantyService.getClaimById(link.claim_id);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });
  req.staffLink = link;
  req.warrantyClaim = claim;
  next();
};

router.get(
  '/staff/:code',
  warrantyLookupRateLimit,
  loadStaffLinkByToken,
  async (req, res) => {
    const [events, mediaItems] = await Promise.all([
      warrantyService.getClaimEvents(req.warrantyClaim.id),
      warrantyService.listClaimMedia(req.warrantyClaim.id)
    ]);
    return res.json({
      staffLink: {
        id: req.staffLink.id,
        staff_name: req.staffLink.staff_name,
        staff_email: req.staffLink.staff_email,
        claim_number_external: req.staffLink.claim_number_external,
        created_at: req.staffLink.created_at
      },
      claim: req.warrantyClaim,
      allowedStatuses: Array.from(warrantyService.STAFF_ALLOWED_STATUSES),
      events,
      media: mediaItems.map((m) => ({
        id: m.id,
        kind: m.kind,
        original_name: m.original_name,
        size_bytes: m.size_bytes,
        mime_type: m.mime_type,
        uploaded_by_kind: m.uploaded_by_kind,
        uploader_name: m.uploader_name,
        created_at: m.created_at
      }))
    });
  }
);

// Defined BEFORE /staff/:code/media/:mediaId so the literal "archive" segment
// is not captured by the :mediaId param.
router.get(
  '/staff/:code/media/archive',
  warrantyLookupRateLimit,
  loadStaffLinkByToken,
  async (req, res) => {
    const claim = req.warrantyClaim;
    const mediaItems = await warrantyService.listClaimMedia(claim.id);
    if (!mediaItems.length) {
      return res.status(404).json({ error: 'No media to download' });
    }
    return media.streamClaimMediaArchive(res, { claim, media: mediaItems });
  }
);

router.get(
  '/staff/:code/media/:mediaId',
  warrantyLookupRateLimit,
  loadStaffLinkByToken,
  param('mediaId').isUUID(),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const item = await warrantyService.getMediaById(req.params.mediaId);
    if (!item || item.claim_id !== req.warrantyClaim.id) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const abs = media.absoluteMediaPath(item.storage_path);
    if (!abs) return res.status(404).json({ error: 'Media not found' });
    res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.original_name)}"`);
    // The helmet defaults set CORP=same-origin, which blocks <img src> when the
    // frontend (e.g. :3000) and backend (:4000) live on different origins. The
    // URL itself carries the auth (UUID + token), so it is safe to override.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Media not found' });
    });
  }
);

router.post(
  '/staff/:code/note',
  loadStaffLinkByToken,
  [
    body('body').isString().trim().isLength({ min: 1, max: 3000 }),
    body('visible_to_customer').isBoolean()
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const event = await warrantyService.addNote(req.warrantyClaim.id, {
        body: req.body.body,
        visibleToCustomer: Boolean(req.body.visible_to_customer),
        actorKind: 'staff',
        actorStaffLinkId: req.staffLink.id
      });
      notify.queueClaimActivityDigest(req.warrantyClaim.id);
      return res.status(201).json(event);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.post(
  '/staff/:code/files',
  loadStaffLinkByToken,
  acceptUploads,
  async (req, res) => {
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const claim = req.warrantyClaim;
    const check = media.validateUploadedFiles(uploadedFiles, {
      existingPhotoCount: claim.photo_count,
      existingVideoCount: claim.video_count,
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
          uploadedByKind: 'staff',
          uploadedByStaffLinkId: req.staffLink.id
        });
        attached.push(record);
      }
      notify.queueClaimActivityDigest(claim.id);
      return res.status(201).json({ uploaded: attached });
    } catch (err) {
      logger.error('Warranty: staff upload failed', { error: err.message });
      await media.purgePendingFiles(uploadedFiles);
      return res.status(500).json({ error: 'Failed to attach files' });
    }
  }
);

router.patch(
  '/staff/:code/claim-number',
  loadStaffLinkByToken,
  [body('claim_number_external').isString().trim().isLength({ min: 1, max: 120 })],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    try {
      const result = await warrantyService.setStaffClaimNumber(req.staffLink.id, {
        claimNumberExternal: req.body.claim_number_external
      });
      notify.queueClaimActivityDigest(req.warrantyClaim.id);
      return res.json(result);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

router.patch(
  '/staff/:code/status',
  loadStaffLinkByToken,
  [
    body('status').isString().custom((value) => warrantyService.ALL_STATUSES.includes(value)),
    body('note').optional({ checkFalsy: true }).isString().isLength({ max: 3000 })
  ],
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    if (req.body.status === 'closed') {
      return res.status(400).json({ error: 'Staff users cannot close a claim' });
    }
    try {
      const result = await warrantyService.updateClaimStatus(
        req.warrantyClaim.id,
        req.body.status,
        {
          actorKind: 'staff',
          actorStaffLinkId: req.staffLink.id,
          note: req.body.note || null
        }
      );
      notify.queueClaimActivityDigest(req.warrantyClaim.id);
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

export default router;
