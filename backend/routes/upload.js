// backend/routes/upload.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { formSubmissionRateLimit } from '../middlewares/security.js';
import { logger } from '../middlewares/errorHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  IMAGE_MIME_TO_EXT,
  DOC_MIME_TO_EXT,
  AUDIO_MIME_TO_EXT,
  normalizeSafeExtension,
  validateMimeAndExtension,
} from '../utils/uploadValidation.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const requirePublicUploadToken = (req, res, next) => {
  const configuredToken = process.env.FORM_UPLOAD_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({ error: 'Public upload is temporarily unavailable' });
  }
  const providedToken = req.headers['x-form-upload-token'];
  if (!providedToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Unauthorized upload request' });
  }
  return next();
};

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const imagesDir = path.join(uploadsDir, 'images');
const serviceImagesDir = path.join(uploadsDir, 'service-images');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(serviceImagesDir)) {
  fs.mkdirSync(serviceImagesDir, { recursive: true });
}

// Form branding asset directories
const formBackgroundsDir = path.join(uploadsDir, 'form-backgrounds');
const formLogosDir = path.join(uploadsDir, 'form-logos');
const formSubmissionsDir = path.join(uploadsDir, 'form-submissions');

if (!fs.existsSync(formBackgroundsDir)) {
  fs.mkdirSync(formBackgroundsDir, { recursive: true });
}
if (!fs.existsSync(formLogosDir)) {
  fs.mkdirSync(formLogosDir, { recursive: true });
}
if (!fs.existsSync(formSubmissionsDir)) {
  fs.mkdirSync(formSubmissionsDir, { recursive: true });
}

// Configure multer for general images
const imageStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, imagesDir);
  },
  filename: function (req, file, cb) {
    const ext = normalizeSafeExtension(file.originalname, '.jpg');
    const safeUser = (req.user?.id || 'user').toString();
    const name = `image-${safeUser}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

// Configure multer for service images
const serviceImageStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, serviceImagesDir);
  },
  filename: function (req, file, cb) {
    const ext = normalizeSafeExtension(file.originalname, '.jpg');
    const safeUser = (req.user?.id || 'user').toString();
    const name = `service-${safeUser}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = function (_req, file, cb) {
  if (validateMimeAndExtension(file, IMAGE_MIME_TO_EXT)) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed (JPEG, PNG, GIF, WebP)'));
  }
};

const imageUpload = multer({
  storage: imageStorage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB — modern phone photos routinely exceed 5MB
});

// Wrap multer so size/mime rejections surface as JSON 400/413 instead of
// bubbling to the generic express error handler (which surfaces in the SPA
// as a vague "upload failed" toast). Also enforces a non-empty upload when
// `requireFile` is set.
const handleMulterError = (uploader, { requireFile = true } = {}) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) {
      logger.warn('Upload rejected', {
        code: err.code,
        message: err.message,
        field: err.field,
        path: req.originalUrl
      });
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large. Maximum size is 15 MB per image.',
          code: 'LIMIT_FILE_SIZE'
        });
      }
      return res.status(400).json({
        error: err.message || 'File upload rejected.',
        code: err.code || 'UPLOAD_REJECTED'
      });
    }
    if (requireFile) {
      const hasOne = !!req.file;
      const hasMany = Array.isArray(req.files) && req.files.length > 0;
      if (!hasOne && !hasMany) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
    }
    return next();
  });
};

const serviceImageUpload = multer({
  storage: serviceImageStorage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// Configure multer for form backgrounds (larger file size for high-res images)
const formBackgroundStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, formBackgroundsDir);
  },
  filename: function (req, file, cb) {
    const ext = normalizeSafeExtension(file.originalname, '.jpg');
    const safeUser = (req.user?.id || 'user').toString();
    const name = `bg-${safeUser}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

// Configure multer for form logos
const formLogoStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, formLogosDir);
  },
  filename: function (req, file, cb) {
    const ext = normalizeSafeExtension(file.originalname, '.png');
    const safeUser = (req.user?.id || 'user').toString();
    const name = `logo-${safeUser}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const formBackgroundUpload = multer({ 
  storage: formBackgroundStorage, 
  fileFilter, 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB for high-res backgrounds
});

const formLogoUpload = multer({ 
  storage: formLogoStorage, 
  fileFilter, 
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB for logos
});

// For service image uploads
router.post('/service-image', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(serviceImageUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/service-images/${req.file.filename}`;
    res.json({ imageUrl: relativePath });
  } catch (error) {
    logger.error('Error uploading service image:', error);
    res.status(500).json({ error: 'Failed to upload service image' });
  }
});

// Form background image upload
router.post('/form-background', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(formBackgroundUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/form-backgrounds/${req.file.filename}`;
    res.json({ url: relativePath, imageUrl: relativePath });
  } catch (error) {
    logger.error('Error uploading form background:', error);
    res.status(500).json({ error: 'Failed to upload form background' });
  }
});

// Form logo upload
router.post('/form-logo', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(formLogoUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/form-logos/${req.file.filename}`;
    res.json({ url: relativePath, imageUrl: relativePath });
  } catch (error) {
    logger.error('Error uploading form logo:', error);
    res.status(500).json({ error: 'Failed to upload form logo' });
  }
});

// General image upload endpoint for products, etc.
router.post('/image', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(imageUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/images/${req.file.filename}`;
    res.json({ url: relativePath });
  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

router.post('/images', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(imageUpload.array('images', 20)), (req, res) => {
  try {
    const uploadedImages = req.files.map(file => ({
      url: `/uploads/images/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size
    }));
    
    res.json({
      images: uploadedImages,
      count: uploadedImages.length
    });
  } catch (error) {
    logger.error('Error uploading multiple images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Repair photo upload — accessible to all authenticated users.
router.post('/repair-image', authenticateJWT, handleMulterError(imageUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/images/${req.file.filename}`;
    res.json({ url: relativePath });
  } catch (error) {
    logger.error('Error uploading repair image:', error);
    res.status(500).json({ error: 'Failed to upload repair image' });
  }
});

// Configure multer for bank transfer / wallet deposit receipts (JPEG, PNG, PDF)
const receiptsDir = path.join(uploadsDir, 'receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const ext = normalizeSafeExtension(file.originalname, '.bin');
    const safeUser = (req.user?.id || 'user').toString();
    cb(null, `receipt-${safeUser}-${Date.now()}${ext}`);
  }
});

const RECEIPT_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

const receiptFileFilter = (_req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  if (RECEIPT_MIME_TO_EXT[mime]) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, or PDF files are accepted for receipts.'));
  }
};

const receiptUpload = multer({
  storage: receiptStorage,
  fileFilter: receiptFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/wallet-deposit', authenticateJWT, handleMulterError(receiptUpload.single('image')), (req, res) => {
  const relativePath = `/uploads/receipts/${req.file.filename}`;
  res.json({ url: relativePath });
});


// Chat media upload endpoints
const chatImagesDir = path.join(uploadsDir, 'chat-images');
const chatFilesDir = path.join(uploadsDir, 'chat-files');
const voiceMessagesDir = path.join(uploadsDir, 'voice-messages');

if (!fs.existsSync(chatImagesDir)) {
  fs.mkdirSync(chatImagesDir, { recursive: true });
}
if (!fs.existsSync(chatFilesDir)) {
  fs.mkdirSync(chatFilesDir, { recursive: true });
}
if (!fs.existsSync(voiceMessagesDir)) {
  fs.mkdirSync(voiceMessagesDir, { recursive: true });
}

// Chat image upload (10MB limit)
const chatImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatImagesDir),
  filename: (req, file, cb) => {
    const ext = normalizeSafeExtension(file.originalname, '.jpg');
    const name = `chat-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const chatImageUpload = multer({
  storage: chatImageStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/chat-image', authenticateJWT, handleMulterError(chatImageUpload.single('file')), (req, res) => {
  try {
    const relativePath = `chat-images/${req.file.filename}`;
    res.json({
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    logger.error('Error uploading chat image:', error);
    res.status(500).json({ error: 'Failed to upload chat image' });
  }
});

// Chat file upload (25MB limit, documents)
const chatFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatFilesDir),
  filename: (req, file, cb) => {
    const ext = normalizeSafeExtension(file.originalname, '.bin');
    const name = `file-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const chatFileFilter = (_req, file, cb) => {
  const spreadsheetMap = {
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
  };
  if (validateMimeAndExtension(file, { ...DOC_MIME_TO_EXT, ...spreadsheetMap })) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, Word, Excel, and text files are allowed'));
  }
};

const chatFileUpload = multer({
  storage: chatFileStorage,
  fileFilter: chatFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

router.post('/chat-file', authenticateJWT, handleMulterError(chatFileUpload.single('file')), (req, res) => {
  try {
    const relativePath = `chat-files/${req.file.filename}`;
    res.json({
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    logger.error('Error uploading chat file:', error);
    res.status(500).json({ error: 'Failed to upload chat file' });
  }
});

// Voice message upload (5MB limit, 2 minutes max)
const voiceMessageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, voiceMessagesDir),
  filename: (req, file, cb) => {
    const ext = normalizeSafeExtension(file.originalname, '.webm');
    const name = `voice-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const voiceMessageFilter = (_req, file, cb) => {
  if (validateMimeAndExtension(file, AUDIO_MIME_TO_EXT)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed (WebM, OGG, MP4, M4A)'));
  }
};

const voiceMessageUpload = multer({
  storage: voiceMessageStorage,
  fileFilter: voiceMessageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

router.post('/voice-message', authenticateJWT, handleMulterError(voiceMessageUpload.single('file')), (req, res) => {
  try {
    // Validate duration if provided (client should enforce 2-minute limit)
    const duration = parseInt(req.body.duration);
    if (duration && duration > 120) {
      // Delete uploaded file if over limit
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Voice message duration cannot exceed 2 minutes' });
    }
    
    const relativePath = `voice-messages/${req.file.filename}`;
    res.json({
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size,
      duration: duration || null
    });
  } catch (error) {
    logger.error('Error uploading voice message:', error);
    res.status(500).json({ error: 'Failed to upload voice message' });
  }
});

// Equipment photo upload endpoint
router.post('/equipment-image', authenticateJWT, authorizeRoles(['admin', 'manager']), handleMulterError(imageUpload.single('image')), (req, res) => {
  try {
    const relativePath = `/uploads/images/${req.file.filename}`;
    res.json({ url: relativePath });
  } catch (error) {
    logger.error('Error uploading equipment image:', error);
    res.status(500).json({ error: 'Failed to upload equipment image' });
  }
});

// ============================================
// PUBLIC FORM SUBMISSION UPLOADS (No Authentication)
// Rate limited to prevent abuse
// ============================================

// Configure multer for public form submission uploads
const formSubmissionStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, formSubmissionsDir);
  },
  filename: function (_req, file, cb) {
    const ext = normalizeSafeExtension(file.originalname, '.jpg');
    // Use UUID for security - no user ID since public
    const name = `form-${uuidv4()}${ext}`;
    cb(null, name);
  }
});

const formSubmissionFileFilter = function (_req, file, cb) {
  if (validateMimeAndExtension(file, { ...IMAGE_MIME_TO_EXT, ...DOC_MIME_TO_EXT })) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Allowed: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX'));
  }
};

const formSubmissionUpload = multer({
  storage: formSubmissionStorage,
  fileFilter: formSubmissionFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for CVs and documents
});

/**
 * PUBLIC endpoint for form submission file uploads
 * No authentication required but rate limited
 * Used for profile photos, CV uploads, etc. in public forms
 */
router.post('/form-submission', formSubmissionRateLimit, requirePublicUploadToken, handleMulterError(formSubmissionUpload.single('file')), (req, res) => {
  try {
    const relativePath = `/uploads/form-submissions/${req.file.filename}`;

    res.json({
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    logger.error('Error uploading form submission file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * PUBLIC endpoint for multiple form submission file uploads
 * For forms that need multiple file uploads
 */
router.post('/form-submission-multiple', formSubmissionRateLimit, requirePublicUploadToken, handleMulterError(formSubmissionUpload.array('files', 5)), (req, res) => {
  try {
    const uploadedFiles = req.files.map(file => ({
      url: `/uploads/form-submissions/${file.filename}`,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));
    
    res.json({
      files: uploadedFiles,
      count: uploadedFiles.length
    });
  } catch (error) {
    logger.error('Error uploading form submission files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

export default router;
