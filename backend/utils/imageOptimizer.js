// backend/utils/imageOptimizer.js
// Write-side image optimization — the counterpart to backend/routes/media.js.
//
// media.js shrinks images on *delivery* (it serves a width-capped WebP rendition
// of whatever is on disk). This module shrinks them on *upload* so the on-disk
// originals stop growing: the multi-MB phone photo / oversized PNG that used to
// land in /uploads verbatim is downscaled to a sane max dimension and re-encoded
// as WebP (the best format for both photos and graphics-with-alpha). A 5 MB PNG
// typically becomes a few hundred KB with no visible quality loss at display size.
//
// Safety contract (mirrors media.js): `sharp` is imported lazily and ANY failure
// leaves the originally-uploaded file exactly as multer wrote it, so a broken or
// missing sharp binary — or an exotic input sharp can't read — degrades to the
// previous behaviour (unoptimised but working) and can NEVER fail the upload.

import fs from 'fs';
import path from 'path';
import { logger } from '../middlewares/errorHandler.js';

// Formats we will re-encode. SVG/PDF never reach here (different upload filters);
// animated multi-frame images are detected and skipped below so we don't flatten
// them to a single frame.
const OPTIMIZABLE_EXT = /\.(jpe?g|png|webp|tiff?|heic|heif|avif)$/i;

const safeSize = (p) => {
  try { return fs.statSync(p).size; } catch { return Infinity; }
};

/**
 * Optimize a single image file on disk: downscale the longest edge to `maxDim`,
 * strip metadata (after baking EXIF orientation) and re-encode as WebP. The new
 * `.webp` file replaces the original; the original is removed when its extension
 * differed. On any failure the original file is left untouched and `null` is
 * returned.
 *
 * @param {string} absPath absolute path of the file multer wrote
 * @param {object} [opts]
 * @param {number} [opts.maxDim=2000] cap for the longest edge in px (never enlarges)
 * @param {number} [opts.quality=82] WebP quality (1-100)
 * @returns {Promise<{filename:string, path:string, size:number, mimetype:string}|null>}
 */
export async function optimizeImageInPlace(absPath, { maxDim = 2000, quality = 82 } = {}) {
  if (!absPath || !OPTIMIZABLE_EXT.test(absPath)) return null;

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (e) {
    logger.warn('[imageOptimizer] sharp unavailable — keeping original upload', { error: e.message });
    return null;
  }

  try {
    // Skip animated images (multi-frame GIF/WebP) — re-encoding without
    // `animated: true` would flatten them to the first frame.
    const meta = await sharp(absPath, { failOn: 'none' }).metadata();
    if (meta?.pages && meta.pages > 1) return null;

    const buf = await sharp(absPath, { failOn: 'none', animated: false })
      .rotate() // honour EXIF orientation before metadata is dropped
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();

    // If WebP isn't actually smaller (tiny icons, already-optimised graphics),
    // keep the original rather than bloating it.
    if (buf.length >= safeSize(absPath)) return null;

    const dir = path.dirname(absPath);
    const base = path.basename(absPath, path.extname(absPath));
    const newPath = path.join(dir, `${base}.webp`);

    // Atomic-ish: write a temp file then rename over the target.
    const tmp = `${newPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, newPath);

    // Remove the source if we changed the extension (e.g. .png -> .webp).
    if (path.resolve(newPath) !== path.resolve(absPath)) {
      try { fs.unlinkSync(absPath); } catch { /* already gone */ }
    }

    return {
      filename: path.basename(newPath),
      path: newPath,
      size: buf.length,
      mimetype: 'image/webp',
    };
  } catch (e) {
    logger.warn('[imageOptimizer] optimize failed — keeping original upload', { file: absPath, error: e.message });
    return null;
  }
}

/**
 * Optimize a multer file object in place, updating `filename`/`path`/`size`/
 * `mimetype` so the route handler's `/uploads/.../${file.filename}` response and
 * the value persisted to the DB point at the optimized WebP file. No-op (and
 * never throws) when optimization is skipped or fails.
 */
export async function optimizeUploadedFile(file, opts) {
  if (!file?.path) return;
  const result = await optimizeImageInPlace(file.path, opts);
  if (result) {
    file.filename = result.filename;
    file.path = result.path;
    file.size = result.size;
    file.mimetype = result.mimetype;
  }
}

/** Optimize every file produced by a multer `.array(...)` upload, sequentially. */
export async function optimizeUploadedFiles(files = [], opts) {
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop -- sequential keeps peak memory low
    await optimizeUploadedFile(file, opts);
  }
}
