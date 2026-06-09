import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// archiver is a CommonJS module. Load it via createRequire (Node ESM has no
// default-interop guarantee for CJS) and lazily inside streamClaimMediaArchive
// so simply importing this module — e.g. in unit tests that never build a ZIP —
// doesn't pull archiver into Jest's experimental-vm-modules loader.
const nodeRequire = createRequire(import.meta.url);

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_PHOTO_SIZE   = 30   * 1024 * 1024;          // 30 MB
export const MAX_VIDEO_SIZE   = 500  * 1024 * 1024;          // 500 MB
export const MAX_TOTAL_PER_CLAIM = 1500 * 1024 * 1024;       // 1.5 GB
export const MAX_PHOTOS       = 10;
export const MAX_VIDEOS       = 3;
export const MAX_FILES_PER_REQUEST = MAX_PHOTOS + MAX_VIDEOS;

// Multer's per-file size cap must be the larger of the two so videos pass through.
// Photo size is enforced separately in the route by kind.
const MULTER_PER_FILE_LIMIT = MAX_VIDEO_SIZE;

const PHOTO_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
]);
const VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'
]);

const MIME_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4':  '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-msvideo': '.avi'
};

// ─── Paths ───────────────────────────────────────────────────────────────────

const UPLOAD_ROOT = path.resolve(__dirname, '../uploads');
const WARRANTY_ROOT = path.join(UPLOAD_ROOT, 'warranty');
const PENDING_DIR = path.join(WARRANTY_ROOT, '_pending');

[UPLOAD_ROOT, WARRANTY_ROOT, PENDING_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

export function claimDir(claimId) {
  return path.join(WARRANTY_ROOT, claimId);
}

export function ensureClaimDir(claimId) {
  const dir = claimDir(claimId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function relativeStoragePath(claimId, filename) {
  return path.posix.join('warranty', claimId, filename);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function kindForMime(mimetype) {
  const mime = (mimetype || '').toLowerCase();
  if (PHOTO_MIMES.has(mime)) return 'photo';
  if (VIDEO_MIMES.has(mime)) return 'video';
  return null;
}

function safeExtensionFor(file) {
  const fromMime = MIME_EXTENSION[(file.mimetype || '').toLowerCase()];
  if (fromMime) return fromMime;
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;
  return '.bin';
}

// ─── Multer ──────────────────────────────────────────────────────────────────

const pendingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PENDING_DIR),
  filename: (_req, file, cb) => {
    const ext = safeExtensionFor(file);
    cb(null, `pending-${uuidv4()}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const kind = kindForMime(file.mimetype);
  if (!kind) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.code = 'INVALID_MIME';
    err.message = `Unsupported file type: ${file.mimetype}`;
    return cb(err);
  }
  cb(null, true);
}

export const claimMediaUpload = multer({
  storage: pendingStorage,
  fileFilter,
  limits: {
    fileSize: MULTER_PER_FILE_LIMIT,
    files: MAX_FILES_PER_REQUEST
  }
});

// Mirror routes/upload.js — convert multer errors into JSON 4xx instead of 500.
export const handleMulterError = (uploader, { requireFile = true } = {}) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) {
      logger.warn('Warranty upload rejected', {
        code: err.code, message: err.message, field: err.field, path: req.originalUrl
      });
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `File too large. Photos must be ≤ ${Math.round(MAX_PHOTO_SIZE / 1024 / 1024)} MB and videos ≤ ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)} MB.`,
          code: 'LIMIT_FILE_SIZE'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: err.message || 'Too many files in this upload.',
          code: err.code
        });
      }
      if (err.code === 'INVALID_MIME') {
        return res.status(415).json({ error: err.message, code: 'INVALID_MIME' });
      }
      return res.status(400).json({
        error: err.message || 'Upload rejected.',
        code: err.code || 'UPLOAD_REJECTED'
      });
    }
    if (requireFile) {
      const hasMany = Array.isArray(req.files) && req.files.length > 0;
      if (!hasMany) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
    }
    return next();
  });
};

// ─── Validation & relocation ─────────────────────────────────────────────────

/**
 * Validate the files multer already wrote to disk.
 * Returns either { ok: true } or { ok: false, status, error, code }.
 * On failure, the caller must invoke purgePendingFiles(files) to clean up.
 */
export function validateUploadedFiles(files, { existingPhotoCount = 0, existingVideoCount = 0, existingTotalBytes = 0 } = {}) {
  let newPhotoBytes = 0;
  let newPhotoCount = 0;
  let newVideoCount = 0;
  let newTotalBytes = 0;

  for (const file of files) {
    const kind = kindForMime(file.mimetype);
    if (kind === 'photo') {
      if (file.size > MAX_PHOTO_SIZE) {
        return { ok: false, status: 413, code: 'PHOTO_TOO_LARGE',
          error: `Photo "${file.originalname}" is larger than ${Math.round(MAX_PHOTO_SIZE / 1024 / 1024)} MB.` };
      }
      newPhotoBytes += file.size;
      newPhotoCount += 1;
    } else if (kind === 'video') {
      if (file.size > MAX_VIDEO_SIZE) {
        return { ok: false, status: 413, code: 'VIDEO_TOO_LARGE',
          error: `Video "${file.originalname}" is larger than ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)} MB.` };
      }
      newVideoCount += 1;
    } else {
      return { ok: false, status: 415, code: 'INVALID_MIME',
        error: `Unsupported file type for "${file.originalname}".` };
    }
    newTotalBytes += file.size;
  }

  if (existingPhotoCount + newPhotoCount > MAX_PHOTOS) {
    return { ok: false, status: 400, code: 'TOO_MANY_PHOTOS',
      error: `Maximum ${MAX_PHOTOS} photos per claim.` };
  }
  if (existingVideoCount + newVideoCount > MAX_VIDEOS) {
    return { ok: false, status: 400, code: 'TOO_MANY_VIDEOS',
      error: `Maximum ${MAX_VIDEOS} videos per claim.` };
  }
  if (existingTotalBytes + newTotalBytes > MAX_TOTAL_PER_CLAIM) {
    return { ok: false, status: 413, code: 'CLAIM_QUOTA_EXCEEDED',
      error: `This claim would exceed the ${Math.round(MAX_TOTAL_PER_CLAIM / 1024 / 1024 / 1024 * 10) / 10} GB total upload limit.` };
  }
  // Mark the kind on each file for callers
  return { ok: true, newPhotoBytes, newTotalBytes };
}

export async function purgePendingFiles(files = []) {
  for (const file of files) {
    if (!file?.path) continue;
    try {
      await fsp.unlink(file.path);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn('Failed to remove pending warranty upload', { path: file.path, error: err.message });
      }
    }
  }
}

/**
 * Move multer-saved pending files into the claim's directory, returning the
 * new file metadata ready for warrantyService.attachMediaRecord().
 */
export async function relocatePendingFilesToClaim(files, claimId) {
  ensureClaimDir(claimId);
  const moved = [];
  for (const file of files) {
    const kind = kindForMime(file.mimetype);
    const ext = safeExtensionFor(file);
    const finalName = `${kind}-${uuidv4()}${ext}`;
    const destPath = path.join(claimDir(claimId), finalName);
    try {
      await fsp.rename(file.path, destPath);
    } catch (err) {
      // Cross-device rename may need copy+unlink fallback.
      if (err.code === 'EXDEV') {
        await fsp.copyFile(file.path, destPath);
        await fsp.unlink(file.path).catch(() => {});
      } else {
        throw err;
      }
    }
    moved.push({
      kind,
      filename: finalName,
      originalName: file.originalname,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      storagePath: relativeStoragePath(claimId, finalName),
      absolutePath: destPath
    });
  }
  return moved;
}

export async function deleteMediaFile(storagePath) {
  if (!storagePath) return;
  const abs = path.join(UPLOAD_ROOT, storagePath);
  try {
    await fsp.unlink(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('Failed to delete warranty media file', { storagePath, error: err.message });
    }
  }
}

export async function purgeClaimFiles(claimId) {
  const dir = claimDir(claimId);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn('Failed to purge warranty claim directory', { dir, error: err.message });
  }
}

export function absoluteMediaPath(storagePath) {
  if (!storagePath) return null;
  return path.join(UPLOAD_ROOT, storagePath);
}

// ─── ZIP export ──────────────────────────────────────────────────────────────

function sanitizeArchiveName(name) {
  const cleaned = String(name || 'file')
    .replace(/[/\\?%*:|"<> -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'file';
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Stream a claim's media to the response as a single ZIP. Files are foldered by
 * who uploaded them — `Customer/` for customer submissions, `Team/` for staff
 * and admin uploads — and a `manifest.csv` records the exact role, uploader
 * name, kind, size and timestamp of every file (so the precise staff/admin
 * split is preserved even though both share the Team/ folder).
 *
 * `media` rows are expected from warrantyService.listClaimMedia (enriched with
 * uploaded_by_kind + uploader_name). The response headers are set here; the
 * caller must not have written a body yet.
 */
export function streamClaimMediaArchive(res, { claim, media = [] }) {
  const archiver = nodeRequire('archiver');
  const base = sanitizeArchiveName(`warranty-${claim.customer_token || claim.id}`);
  const archive = archiver('zip', { zlib: { level: 6 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-media.zip"`);

  archive.on('warning', (err) => {
    logger.warn('Warranty zip warning', { claimId: claim.id, error: err.message });
  });
  archive.on('error', (err) => {
    logger.error('Warranty zip failed', { claimId: claim.id, error: err.message });
    try { res.destroy(err); } catch { /* response already torn down */ }
  });

  archive.pipe(res);

  const manifest = [
    ['folder', 'file', 'uploader_role', 'uploader_name', 'kind', 'size_bytes', 'uploaded_at', 'original_name']
      .map(csvCell).join(',')
  ];

  let index = 0;
  for (const m of media) {
    const abs = absoluteMediaPath(m.storage_path);
    if (!abs || !fs.existsSync(abs)) continue;
    index += 1;
    const folder = m.uploaded_by_kind === 'customer' ? 'Customer' : 'Team';
    const safe = `${String(index).padStart(2, '0')}-${sanitizeArchiveName(m.original_name)}`;
    archive.file(abs, { name: `${folder}/${safe}` });
    manifest.push([
      folder,
      safe,
      m.uploaded_by_kind || '',
      m.uploader_name || (m.uploaded_by_kind === 'customer' ? (claim.customer_name || 'Customer') : ''),
      m.kind || '',
      m.size_bytes != null ? String(m.size_bytes) : '',
      m.created_at ? new Date(m.created_at).toISOString() : '',
      m.original_name || ''
    ].map(csvCell).join(','));
  }

  archive.append(`${manifest.join('\n')}\n`, { name: 'manifest.csv' });
  archive.finalize();
}

export default {
  MAX_PHOTO_SIZE,
  MAX_VIDEO_SIZE,
  MAX_TOTAL_PER_CLAIM,
  MAX_PHOTOS,
  MAX_VIDEOS,
  MAX_FILES_PER_REQUEST,
  kindForMime,
  claimMediaUpload,
  handleMulterError,
  validateUploadedFiles,
  purgePendingFiles,
  relocatePendingFilesToClaim,
  deleteMediaFile,
  purgeClaimFiles,
  absoluteMediaPath,
  streamClaimMediaArchive,
  claimDir,
  ensureClaimDir,
  relativeStoragePath
};
