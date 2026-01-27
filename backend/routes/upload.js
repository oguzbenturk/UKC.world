// backend/routes/upload.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { formSubmissionRateLimit } from '../middlewares/security-clean.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const ext = path.extname(file.originalname) || '.jpg';
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
    const ext = path.extname(file.originalname) || '.jpg';
    const safeUser = (req.user?.id || 'user').toString();
    const name = `service-${safeUser}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = function (_req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed (JPEG, PNG, GIF, WebP)'));
  }
};

const imageUpload = multer({ 
  storage: imageStorage, 
  fileFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const serviceImageUpload = multer({ 
  storage: serviceImageStorage, 
  fileFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Configure multer for form backgrounds (larger file size for high-res images)
const formBackgroundStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, formBackgroundsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
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
    const ext = path.extname(file.originalname) || '.png';
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
router.post('/service-image', authenticateJWT, authorizeRoles(['admin', 'manager']), serviceImageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/service-images/${req.file.filename}`;
    console.log('Service image uploaded:', relativePath);
    res.json({ imageUrl: relativePath });
  } catch (error) {
    console.error('Error uploading service image:', error);
    res.status(500).json({ error: 'Failed to upload service image' });
  }
});

// Form background image upload
router.post('/form-background', authenticateJWT, authorizeRoles(['admin', 'manager']), formBackgroundUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/form-backgrounds/${req.file.filename}`;
    console.log('Form background uploaded:', relativePath);
    res.json({ url: relativePath, imageUrl: relativePath });
  } catch (error) {
    console.error('Error uploading form background:', error);
    res.status(500).json({ error: 'Failed to upload form background' });
  }
});

// Form logo upload
router.post('/form-logo', authenticateJWT, authorizeRoles(['admin', 'manager']), formLogoUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/form-logos/${req.file.filename}`;
    console.log('Form logo uploaded:', relativePath);
    res.json({ url: relativePath, imageUrl: relativePath });
  } catch (error) {
    console.error('Error uploading form logo:', error);
    res.status(500).json({ error: 'Failed to upload form logo' });
  }
});

// General image upload endpoint for products, etc.
router.post('/image', authenticateJWT, authorizeRoles(['admin', 'manager']), imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/images/${req.file.filename}`;
    console.log('Image uploaded:', relativePath);
    res.json({ url: relativePath });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Multiple images upload endpoint for products with multiple photos
router.post('/images', authenticateJWT, authorizeRoles(['admin', 'manager']), imageUpload.array('images', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedImages = req.files.map(file => ({
      url: `/uploads/images/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size
    }));
    
    console.log(`Multiple images uploaded: ${uploadedImages.length} files`);
    res.json({ 
      images: uploadedImages,
      count: uploadedImages.length 
    });
  } catch (error) {
    console.error('Error uploading multiple images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Repair photo upload endpoint - accessible to all authenticated users
router.post('/repair-image', authenticateJWT, imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/images/${req.file.filename}`;
    console.log('Repair image uploaded:', relativePath);
    res.json({ url: relativePath });
  } catch (error) {
    console.error('Error uploading repair image:', error);
    res.status(500).json({ error: 'Failed to upload repair image' });
  }
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
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `chat-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const chatImageUpload = multer({
  storage: chatImageStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/chat-image', authenticateJWT, chatImageUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `chat-images/${req.file.filename}`;
    console.log('Chat image uploaded:', relativePath);
    res.json({ 
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading chat image:', error);
    res.status(500).json({ error: 'Failed to upload chat image' });
  }
});

// Chat file upload (25MB limit, documents)
const chatFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatFilesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `file-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const chatFileFilter = (_req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  if (allowed.includes(file.mimetype)) {
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

router.post('/chat-file', authenticateJWT, chatFileUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `chat-files/${req.file.filename}`;
    console.log('Chat file uploaded:', relativePath);
    res.json({ 
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Error uploading chat file:', error);
    res.status(500).json({ error: 'Failed to upload chat file' });
  }
});

// Voice message upload (5MB limit, 2 minutes max)
const voiceMessageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, voiceMessagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    const name = `voice-${req.user?.id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const voiceMessageFilter = (_req, file, cb) => {
  const allowed = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/x-m4a'
  ];
  if (allowed.includes(file.mimetype)) {
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

router.post('/voice-message', authenticateJWT, voiceMessageUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Validate duration if provided (client should enforce 2-minute limit)
    const duration = parseInt(req.body.duration);
    if (duration && duration > 120) {
      // Delete uploaded file if over limit
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Voice message duration cannot exceed 2 minutes' });
    }
    
    const relativePath = `voice-messages/${req.file.filename}`;
    console.log('Voice message uploaded:', relativePath);
    res.json({ 
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size,
      duration: duration || null
    });
  } catch (error) {
    console.error('Error uploading voice message:', error);
    res.status(500).json({ error: 'Failed to upload voice message' });
  }
});

// Equipment photo upload endpoint
router.post('/equipment-image', authenticateJWT, authorizeRoles(['admin', 'manager']), imageUpload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/images/${req.file.filename}`;
    console.log('Equipment image uploaded:', relativePath);
    res.json({ url: relativePath });
  } catch (error) {
    console.error('Error uploading equipment image:', error);
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
    const ext = path.extname(file.originalname) || '.jpg';
    // Use UUID for security - no user ID since public
    const name = `form-${uuidv4()}${ext}`;
    cb(null, name);
  }
});

const formSubmissionFileFilter = function (_req, file, cb) {
  // Allow images and common document types for CVs, etc.
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
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
router.post('/form-submission', formSubmissionRateLimit, formSubmissionUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const relativePath = `/uploads/form-submissions/${req.file.filename}`;
    console.log('Form submission file uploaded:', relativePath);
    
    res.json({ 
      url: relativePath,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Error uploading form submission file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * PUBLIC endpoint for multiple form submission file uploads
 * For forms that need multiple file uploads
 */
router.post('/form-submission-multiple', formSubmissionRateLimit, formSubmissionUpload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = req.files.map(file => ({
      url: `/uploads/form-submissions/${file.filename}`,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));
    
    console.log(`Form submission files uploaded: ${uploadedFiles.length} files`);
    res.json({ 
      files: uploadedFiles,
      count: uploadedFiles.length 
    });
  } catch (error) {
    console.error('Error uploading form submission files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

export default router;
