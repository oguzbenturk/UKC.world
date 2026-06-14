// Backfill: shrink the existing on-disk upload originals.
//
// Why: backend/routes/upload.js now optimizes NEW uploads (converts to WebP,
// downscales), and backend/routes/media.js shrinks images on delivery. But the
// ~3 GB of images uploaded BEFORE the write-side fix are still stored at full
// resolution (avg ~630 KB, up to 5 MB, mostly oversized PNG). This script
// reclaims that space.
//
// Crucial difference from the upload-side optimizer: existing files are
// referenced by their EXACT path in DB columns (products.image_url, images JSON
// arrays, accommodation units, instructor avatars, …). So this script must keep
// each file's filename AND format unchanged — it only downscales the longest
// edge to --max-dim, strips metadata, and re-encodes in the SAME format. Zero DB
// changes, zero broken links. (Converting to WebP would need a DB-wide reference
// rewrite — see the note at the bottom of this file.)
//
// Safety:
//   - DRY-RUN by default: scans and reports projected savings, writes nothing.
//     Pass --commit to actually rewrite files.
//   - Per-file try/catch: one unreadable/exotic file is skipped, never aborts.
//   - Atomic: writes a temp file then renames over the original, so a crash
//     mid-write can't leave a truncated image.
//   - Only replaces a file when the re-encode is meaningfully smaller
//     (>= --min-save percent), so already-optimal files are left byte-for-byte.
//   - Skips animated images (multi-frame GIF/WebP) and non-raster files.
//   - Idempotent: a second run finds little/nothing left to save.
//
// Usage:
//   node backend/scripts/optimize-existing-uploads.js                 # dry-run, all content dirs
//   node backend/scripts/optimize-existing-uploads.js --commit        # actually rewrite
//   node backend/scripts/optimize-existing-uploads.js --dir=images    # limit to one subdir
//   node backend/scripts/optimize-existing-uploads.js --max-dim=2400 --min-kb=80 --commit
//   node backend/scripts/optimize-existing-uploads.js --png-lossy --commit   # aggressive PNG quantization
//
// On production this runs inside the backend container against the uploads volume:
//   docker compose exec backend node scripts/optimize-existing-uploads.js          # dry-run first
//   docker compose exec backend node scripts/optimize-existing-uploads.js --commit

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../uploads');

// Content-image directories worth optimizing. Deliberately EXCLUDES receipts
// (legal/financial proof — keep pristine, may be PDF), form-submissions
// (applicant CVs/docs), chat-files, voice-messages, and the _thumbs cache.
const DEFAULT_DIRS = ['images', 'service-images', 'form-backgrounds', 'form-logos'];

const RASTER_EXT = /\.(jpe?g|png|webp|tiff?)$/i; // gif skipped (animation); heic/avif rare on disk

// ---- args ----
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const COMMIT = has('--commit');
const VERBOSE = has('--verbose') || has('-v');
const PNG_LOSSY = has('--png-lossy');
const MAX_DIM = parseInt(val('max-dim', '2000'), 10);
const MIN_BYTES = parseInt(val('min-kb', '50'), 10) * 1024; // skip files smaller than this
const MIN_SAVE_PCT = parseFloat(val('min-save', '8')); // require >= this % saving to rewrite
const ONLY_DIR = val('dir', null);

const fmtKB = (b) => (b / 1024).toFixed(0).padStart(7) + ' KB';
const fmtMB = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('sharp is required for this script:', e.message);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '_thumbs') continue; // derived cache — never touch
      out.push(...walk(full));
    } else if (ent.isFile() && RASTER_EXT.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

// Re-encode a buffer in its ORIGINAL format, downscaled + metadata-stripped.
async function reencode(absPath, format) {
  let pipe = sharp(absPath, { failOn: 'none', animated: false })
    .rotate() // bake EXIF orientation, then metadata is dropped by default
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true });

  if (format === 'jpeg') {
    pipe = pipe.jpeg({ quality: 82, mozjpeg: true });
  } else if (format === 'png') {
    // Default: lossless re-encode (savings come from downscale + better zlib +
    // metadata strip — safe, no quality change at the new resolution).
    // --png-lossy: palette-quantize for much larger savings on photo-PNGs.
    pipe = PNG_LOSSY
      ? pipe.png({ compressionLevel: 9, effort: 8, palette: true, quality: 82 })
      : pipe.png({ compressionLevel: 9, effort: 8 });
  } else if (format === 'webp') {
    pipe = pipe.webp({ quality: 82, effort: 4 });
  } else if (format === 'tiff') {
    pipe = pipe.tiff({ quality: 82, compression: 'jpeg' });
  } else {
    return null; // unknown — don't touch
  }
  return pipe.toBuffer();
}

async function run() {
  const dirs = ONLY_DIR ? [ONLY_DIR] : DEFAULT_DIRS;
  console.log(`\nuploads root: ${uploadsRoot}`);
  console.log(`mode: ${COMMIT ? 'COMMIT (writing changes)' : 'DRY-RUN (no files written)'}`);
  console.log(`dirs: ${dirs.join(', ')}  |  max-dim: ${MAX_DIM}px  |  min-size: ${(MIN_BYTES / 1024) | 0}KB  |  min-save: ${MIN_SAVE_PCT}%  |  png: ${PNG_LOSSY ? 'lossy/quantized' : 'lossless'}\n`);

  const totals = { scanned: 0, eligible: 0, rewritten: 0, skippedSmall: 0, skippedNoGain: 0, skippedAnim: 0, errors: 0, before: 0, after: 0 };

  for (const d of dirs) {
    const root = path.join(uploadsRoot, d);
    if (!fs.existsSync(root)) { console.log(`(skip) ${d}: not present`); continue; }
    const files = walk(root);
    console.log(`scanning ${d}: ${files.length} raster files`);

    for (const file of files) {
      totals.scanned += 1;
      let origSize;
      try { origSize = fs.statSync(file).size; } catch { totals.errors += 1; continue; }

      if (origSize < MIN_BYTES) { totals.skippedSmall += 1; continue; }

      try {
        const meta = await sharp(file, { failOn: 'none' }).metadata();
        if (meta?.pages && meta.pages > 1) { totals.skippedAnim += 1; continue; }
        const format = meta?.format === 'jpg' ? 'jpeg' : meta?.format;

        const buf = await reencode(file, format);
        if (!buf) { totals.skippedNoGain += 1; continue; }

        const savedPct = ((origSize - buf.length) / origSize) * 100;
        if (buf.length >= origSize || savedPct < MIN_SAVE_PCT) {
          totals.skippedNoGain += 1;
          if (VERBOSE) console.log(`  = ${fmtKB(origSize)}  ${path.relative(uploadsRoot, file)}  (no gain)`);
          continue;
        }

        totals.eligible += 1;
        totals.before += origSize;
        totals.after += buf.length;

        if (COMMIT) {
          const tmp = `${file}.opt-${process.pid}.tmp`;
          fs.writeFileSync(tmp, buf);
          fs.renameSync(tmp, file); // same path/format → DB references untouched
          totals.rewritten += 1;
        }
        if (VERBOSE) {
          console.log(`  ${COMMIT ? '✓' : '~'} ${fmtKB(origSize)} -> ${fmtKB(buf.length)}  (-${savedPct.toFixed(0)}%)  ${path.relative(uploadsRoot, file)}`);
        }
      } catch (e) {
        totals.errors += 1;
        if (VERBOSE) console.log(`  ! error ${path.relative(uploadsRoot, file)}: ${e.message}`);
      }
    }
  }

  const saved = totals.before - totals.after;
  const pct = totals.before ? ((saved / totals.before) * 100).toFixed(1) : '0.0';
  console.log('\n──────── summary ────────');
  console.log(`scanned:            ${totals.scanned}`);
  console.log(`would shrink:       ${totals.eligible}${COMMIT ? ` (rewritten: ${totals.rewritten})` : ''}`);
  console.log(`skipped (small):    ${totals.skippedSmall}`);
  console.log(`skipped (no gain):  ${totals.skippedNoGain}`);
  console.log(`skipped (animated): ${totals.skippedAnim}`);
  console.log(`errors:             ${totals.errors}`);
  console.log(`size before:        ${fmtMB(totals.before)}`);
  console.log(`size after:         ${fmtMB(totals.after)}`);
  console.log(`reclaimed:          ${fmtMB(saved)} (${pct}%)`);
  if (!COMMIT) console.log('\nDRY-RUN — nothing was written. Re-run with --commit to apply.');
  console.log('');
}

// ── Optional, more aggressive future step (NOT done here) ─────────────────────
// To convert every existing file to WebP (largest possible savings) you would
// also have to rewrite every DB reference: products.image_url, products.images
// (JSON array), service image_url columns, accommodation unit images, instructor
// profile_image_url, packages, proposals, etc. That is a DB migration, not a
// disk pass, and is intentionally left out of this safe in-place script.

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
