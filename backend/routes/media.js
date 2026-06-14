// backend/routes/media.js
// On-the-fly image resizer + recompressor for uploaded media.
//
// Why this exists: product images (and other uploads) are stored as full-resolution
// originals — 3+ GB total, avg ~630 KB, up to 5 MB, and mostly PNG (a terrible format
// for photos). Shop grids render dozens of these at thumbnail size, so the browser was
// downloading multiple MB per card. This endpoint serves a width-capped WebP rendition
// (generated once, then cached to disk), shrinking a 5 MB PNG to ~20–80 KB.
//
// It works for EVERY existing image with no backfill, and is mounted PUBLICLY (the shop
// is browsable by anonymous visitors). It only ever reads files that already live under
// /uploads (which nginx already serves publicly), with a path-traversal guard.
//
// Safety: `sharp` is imported lazily and every failure path falls back to redirecting to
// the original file, so a missing/broken sharp binary degrades to today's behaviour
// (unoptimised but working) and can never crash the backend.

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../uploads');
const cacheRoot = path.join(uploadsRoot, '_thumbs');
try { fs.mkdirSync(cacheRoot, { recursive: true }); } catch { /* created lazily on first write */ }

// Snap requested widths to a small set of buckets to maximise cache reuse.
const WIDTH_BUCKETS = [64, 128, 200, 300, 400, 600, 900, 1200, 1600];
const bucketWidth = (w) => {
  const n = parseInt(w, 10);
  if (!Number.isFinite(n) || n <= 0) return 400;
  return WIDTH_BUCKETS.find((x) => x >= n) || WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
};

const RASTER_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?)$/i;

router.get('/img', async (req, res) => {
  const rawSrc = (req.query.src || '').toString();
  const width = bucketWidth(req.query.w);

  // Fallback: send the browser to the untouched original (same-origin /uploads/...).
  const serveOriginal = () => {
    if (rawSrc.startsWith('/uploads/')) return res.redirect(302, rawSrc);
    return res.status(400).end();
  };

  try {
    // Only optimise files under /uploads, reject traversal, require a raster extension.
    if (!rawSrc.startsWith('/uploads/') || rawSrc.includes('..') || rawSrc.includes('\0')) {
      return res.status(400).end();
    }
    const rel = rawSrc.replace(/^\/uploads\//, '');
    const abs = path.resolve(uploadsRoot, rel);
    if (abs !== uploadsRoot && !abs.startsWith(uploadsRoot + path.sep)) {
      return res.status(400).end(); // path traversal attempt
    }
    if (!RASTER_EXT.test(abs)) return serveOriginal();
    let stat;
    try { stat = fs.statSync(abs); } catch { return res.status(404).end(); }
    if (!stat.isFile()) return res.status(404).end();

    const fmt = 'webp';
    const key = crypto
      .createHash('sha1')
      .update(`${abs}|${stat.mtimeMs}|${stat.size}|${width}|${fmt}|v2`)
      .digest('hex');
    const cacheFile = path.join(cacheRoot, `${key}.${fmt}`);

    // Cache hit — stream the pre-rendered thumbnail.
    if (fs.existsSync(cacheFile)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable'); // override global /api no-store
      res.type(`image/${fmt}`);
      return fs.createReadStream(cacheFile).pipe(res);
    }

    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      logger.warn('[media] sharp unavailable — serving original', { error: e.message });
      return serveOriginal();
    }

    const buf = await sharp(abs, { failOn: 'none', animated: false })
      .rotate() // honour EXIF orientation
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    // Best-effort cache write (atomic-ish); never fatal.
    try {
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, cacheFile);
    } catch (e) {
      logger.warn('[media] thumbnail cache write failed', { error: e.message });
    }

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(`image/${fmt}`);
    return res.end(buf);
  } catch (e) {
    logger.warn('[media] resize failed — serving original', { src: rawSrc, error: e.message });
    return serveOriginal();
  }
});

export default router;
