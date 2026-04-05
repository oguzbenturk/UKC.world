#!/usr/bin/env node
/**
 * Batch Image Trimmer
 *
 * Removes blank/gray borders from product images in uploads/images/.
 * Uses sharp's auto-trim which detects the background color from the
 * corner pixels and removes matching borders on all sides.
 *
 * Usage:
 *   node scripts/trim-product-images.mjs --dry-run          # preview only
 *   node scripts/trim-product-images.mjs                    # trim all images
 *   node scripts/trim-product-images.mjs --threshold=20     # more aggressive trim
 *
 * --dry-run      Show what would change, write nothing
 * --threshold=N  Color distance from background to treat as border (default: 15)
 *                Lower = stricter match, higher = more aggressive
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOADS_DIR  = path.resolve(__dirname, '..', 'backend', 'uploads', 'images');
const DRY_RUN      = process.argv.includes('--dry-run');
const THRESHOLD    = parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] ?? '15', 10);
const MIN_REDUCTION = 0.04; // only write if area shrinks by at least 4%
const MIN_DIM       = 50;   // skip result if trimmed dimension is suspiciously tiny

const log  = (m) => console.log(`[Trim] ${m}`);
const ok   = (m) => console.log(`[Trim] ✓  ${m}`);
const warn = (m) => console.log(`[Trim] ⚠  ${m}`);
const err  = (m) => console.log(`[Trim] ✗  ${m}`);

const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function trimImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!EXTS.has(ext)) return null;

  // Read file into buffer first so sharp releases the file handle before we write back
  let inputBuf;
  try { inputBuf = fs.readFileSync(filePath); }
  catch (e) { return { error: `read: ${e.message}` }; }

  // Get original dimensions
  let origMeta;
  try { origMeta = await sharp(inputBuf).metadata(); }
  catch (e) { return { error: `metadata: ${e.message}` }; }

  const origW = origMeta.width;
  const origH = origMeta.height;
  if (!origW || !origH) return { skipped: 'no dimensions' };

  // Skip tiny placeholder images (1x1, etc.)
  if (origW < 50 || origH < 50) return { skipped: `too small (${origW}x${origH})` };

  // Trim
  let result;
  try {
    result = await sharp(inputBuf)
      .trim({ threshold: THRESHOLD })
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    return { error: `trim: ${e.message}` };
  }

  const newW = result.info.width;
  const newH = result.info.height;

  // Safety: if trimmed result is suspiciously tiny, skip
  if (newW < MIN_DIM || newH < MIN_DIM) {
    return { skipped: `trimmed too small (${newW}x${newH}) — threshold too aggressive?` };
  }

  const reduction = 1 - (newW * newH) / (origW * origH);

  // Not worth rewriting if barely changed
  if (reduction < MIN_REDUCTION) {
    return { skipped: true };
  }

  if (!DRY_RUN) {
    try {
      fs.writeFileSync(filePath, result.data);
    } catch (e) {
      return { error: `write: ${e.message}` };
    }
  }

  return { trimmed: true, origW, origH, newW, newH, reduction: (reduction * 100).toFixed(1) };
}

async function main() {
  log(DRY_RUN ? '=== DRY-RUN (no files written) ===' : '=== LIVE TRIM ===');
  log(`Directory:  ${UPLOADS_DIR}`);
  log(`Threshold:  ${THRESHOLD}  |  Min reduction: ${(MIN_REDUCTION * 100).toFixed(0)}%`);

  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()));

  log(`Files found: ${files.length}\n`);

  let trimCount = 0, skipCount = 0, errCount = 0;
  let savedPixels = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fullPath = path.join(UPLOADS_DIR, f);
    const result = await trimImage(fullPath);

    if (!result) continue;

    if (result.error) {
      err(`${f}: ${result.error}`);
      errCount++;
    } else if (result.trimmed) {
      ok(`${f.slice(0, 55).padEnd(55)} ${result.origW}x${result.origH} → ${result.newW}x${result.newH}  (-${result.reduction}%)`);
      savedPixels += (result.origW * result.origH) - (result.newW * result.newH);
      trimCount++;
    } else if (typeof result.skipped === 'string') {
      warn(`${f.slice(0, 55)}: ${result.skipped}`);
      skipCount++;
    } else {
      skipCount++;
    }

    // Progress every 200 files
    if ((i + 1) % 200 === 0) log(`  ... ${i + 1}/${files.length} processed`);
  }

  log('');
  log(`=== COMPLETE ===`);
  log(`  Trimmed:   ${trimCount}`);
  log(`  Unchanged: ${skipCount}`);
  log(`  Errors:    ${errCount}`);
  if (trimCount > 0) log(`  Pixels removed: ~${(savedPixels / 1e6).toFixed(1)}M`);
  if (DRY_RUN) log('\n  Re-run without --dry-run to apply changes.');
}

main().catch(e => { console.error(e); process.exit(1); });
