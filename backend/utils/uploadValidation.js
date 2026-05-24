// backend/utils/uploadValidation.js
// Pure helpers for multer file validation, kept separate from the route so
// they can be unit-tested without spinning up express / multer / the DB.

import path from 'path';

export const IMAGE_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/avif': '.avif'
};

export const DOC_MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt'
};

export const AUDIO_MIME_TO_EXT = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.mp4',
  'audio/mpeg': '.mp3',
  'audio/x-m4a': '.m4a'
};

// Groups of interchangeable extensions. The mime type is the source of
// truth (it matches the file's actual bytes); the extension only has to be
// "close enough" or absent. Phones and screenshot tools routinely produce
// mismatches (e.g. `.jfif` for `image/jpeg`, capitalized `.JPEG`, or no
// extension at all), and rejecting those was the most common cause of
// "I can't upload my photo" reports.
export const EXT_ALIASES = [
  ['.jpg', '.jpeg', '.jpe', '.jfif', '.pjpeg'],
  ['.heic', '.heif'],
  ['.tif', '.tiff'],
];

export const normalizeSafeExtension = (originalName = '', fallback = '.bin') => {
  const ext = path.extname((originalName || '').toLowerCase());
  return /^[a-z0-9.]+$/.test(ext) && ext.length <= 8 ? ext : fallback;
};

export const extMatchesExpected = (ext, expectedExt) => {
  if (!ext) return true; // No extension — trust the mime.
  if (ext === expectedExt) return true;
  return EXT_ALIASES.some(group => group.includes(expectedExt) && group.includes(ext));
};

export const validateMimeAndExtension = (file, allowedMap) => {
  const mime = (file?.mimetype || '').toLowerCase();
  const ext = normalizeSafeExtension(file?.originalname || '', '');
  const expectedExt = allowedMap[mime];
  if (!expectedExt) return false;
  return extMatchesExpected(ext, expectedExt);
};
