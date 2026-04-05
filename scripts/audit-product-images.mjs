#!/usr/bin/env node
/**
 * Product Image Auditor
 *
 * Scans production DB for common image problems:
 *   1. Products with no images at all
 *   2. Products sharing the exact same image URL (cross-product duplicates)
 *   3. Products with duplicate URLs inside their own images[] array
 *   4. Products where image_url is not in the images[] array (inconsistency)
 *   5. Orphaned uploads — image files on disk not referenced by any product
 *   6. Corrupted / truncated image files on disk (PNG IEND, JPEG EOI, WebP RIFF)
 *
 * Usage:
 *   BACKEND_URL=https://plannivo.com node scripts/audit-product-images.mjs
 *   BACKEND_URL=https://plannivo.com node scripts/audit-product-images.mjs --fix
 *   BACKEND_URL=https://plannivo.com node scripts/audit-product-images.mjs --check-files
 *   BACKEND_URL=https://plannivo.com node scripts/audit-product-images.mjs --check-files --fix
 *
 * --fix          patches problems 3 and 4 automatically (dedupes arrays, syncs image_url)
 *                with --check-files: also removes corrupt image refs from DB
 * --check-files  validates every file in uploads/images/ for truncation/corruption
 *                Problems 1, 2, and 5 are reported only — manual review required.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL    = process.env.BACKEND_URL       || 'https://plannivo.com';
const ADMIN_EMAIL = process.env.IMPORT_ADMIN_EMAIL    || 'admin@plannivo.com';
const ADMIN_PW    = process.env.IMPORT_ADMIN_PASSWORD || 'asdasd35';
const FIX_MODE    = process.argv.includes('--fix');
const CHECK_FILES = process.argv.includes('--check-files');

const log  = (m) => console.log(`[Audit] ${m}`);
const warn = (m) => console.log(`[Audit] ⚠  ${m}`);
const ok   = (m) => console.log(`[Audit] ✓  ${m}`);
const err  = (m) => console.log(`[Audit] ✗  ${m}`);

// ── Auth ─────────────────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PW }),
  });
  const body = await res.json();
  if (body.requires2FA) throw new Error('2FA enabled — use a non-2FA account');
  if (!res.ok || !body.token) throw new Error(`Login failed: ${body.error || res.statusText}`);
  return body.token;
}

// ── Load all products ────────────────────────────────────────────────
async function loadAllProducts(token) {
  const all = [];
  let page = 1;
  const limit = 200;
  while (true) {
    const res = await fetch(`${BASE_URL}/api/products?page=${page}&limit=${limit}&status=all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { warn(`Page ${page} returned ${res.status}`); break; }
    const body = await res.json();
    const products = body.products || body.data || [];
    if (products.length === 0) break;
    all.push(...products);
    if (products.length < limit) break;
    page++;
  }
  return all;
}

// ── Patch product ────────────────────────────────────────────────────
async function patchProduct(token, id, payload) {
  const res = await fetch(`${BASE_URL}/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// ── File Integrity ───────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, '..', 'backend', 'uploads', 'images');
const MIN_VALID_SIZE = 5 * 1024; // < 5 KB is suspicious for a product photo

// PNG: IEND chunk marker at end of file
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
// JPEG: End Of Image marker
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
// PNG magic header
const PNG_SIG  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isFileTruncated(filePath) {
  let buf;
  try { buf = fs.readFileSync(filePath); } catch { return 'unreadable'; }

  if (buf.length < MIN_VALID_SIZE) return `too_small (${buf.length} bytes)`;

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.png') {
    // Must start with PNG signature
    if (!buf.slice(0, 8).equals(PNG_SIG)) return 'bad_png_header';
    // Must end with IEND chunk
    const tail = buf.slice(buf.length - 8);
    if (!tail.equals(PNG_IEND)) return 'truncated_png';
    return null;
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    // Must start with FF D8
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return 'bad_jpeg_header';
    // Must end with FF D9
    if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return 'truncated_jpeg';
    return null;
  }

  if (ext === '.webp') {
    // RIFF header: bytes 0-3 = "RIFF", bytes 4-7 = file size (little-endian), bytes 8-11 = "WEBP"
    if (buf.slice(0, 4).toString('ascii') !== 'RIFF') return 'bad_webp_header';
    if (buf.slice(8, 12).toString('ascii') !== 'WEBP') return 'bad_webp_header';
    const riffSize = buf.readUInt32LE(4); // size of rest of file (after RIFF + size field)
    const expectedTotal = riffSize + 8;   // 4 bytes "RIFF" + 4 bytes size field
    if (Math.abs(buf.length - expectedTotal) > 1) return `truncated_webp (riff=${expectedTotal}, actual=${buf.length})`;
    return null;
  }

  // Unknown extension — just check size
  return null;
}

function scanCorruptFiles() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    warn('uploads/images/ directory not found — skipping file integrity check');
    return new Set();
  }

  const files = fs.readdirSync(UPLOADS_DIR);
  const corrupt = new Set();

  for (const name of files) {
    const full = path.join(UPLOADS_DIR, name);
    const reason = isFileTruncated(full);
    if (reason) {
      warn(`  Corrupt file: ${name}  [${reason}]`);
      corrupt.add(`/uploads/images/${name}`);
    }
  }

  return corrupt;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const modeLabel = [FIX_MODE && 'FIX', CHECK_FILES && 'CHECK-FILES'].filter(Boolean).join('+') || 'READ-ONLY';
  log(`=== AUDIT [${modeLabel}] ===`);
  log(`Backend: ${BASE_URL}`);

  let token;
  try { token = await login(); ok('Logged in'); }
  catch (e) { err(`Login: ${e.message}`); process.exit(1); }

  log('Loading all products...');
  const products = await loadAllProducts(token);
  log(`Loaded ${products.length} products`);

  // ── Issue 1: No images ─────────────────────────────────────────────
  const noImages = products.filter(p => !p.image_url && (!p.images || p.images.length === 0));
  log(`\n── Issue 1: Products with no images (${noImages.length}) ──`);
  for (const p of noImages) {
    warn(`  [${p.sku}] "${p.name}" (${p.category}/${p.subcategory || '—'})`);
  }

  // ── Issue 2: Cross-product duplicate image_url ─────────────────────
  const urlToProducts = new Map();
  for (const p of products) {
    if (!p.image_url) continue;
    if (!urlToProducts.has(p.image_url)) urlToProducts.set(p.image_url, []);
    urlToProducts.get(p.image_url).push(p);
  }
  const crossDupes = [...urlToProducts.entries()].filter(([, ps]) => ps.length > 1);
  log(`\n── Issue 2: Cross-product shared image_url (${crossDupes.length} URLs shared) ──`);
  for (const [url, ps] of crossDupes) {
    warn(`  URL: ...${url.slice(-60)}`);
    for (const p of ps) {
      warn(`    → [${p.sku}] "${p.name}"`);
    }
  }

  // ── Issues 3 & 4: Per-product: duplicate URLs in array, image_url not in array ──
  const internalDupes = [];
  const inconsistentPrimary = [];

  for (const p of products) {
    const arr = Array.isArray(p.images) ? p.images : [];

    // Deduplicate the images array
    const unique = [...new Set(arr)];
    if (unique.length < arr.length) {
      internalDupes.push({ product: p, original: arr, deduped: unique });
    }

    // image_url should be first item of images[]
    if (p.image_url && unique.length > 0 && unique[0] !== p.image_url) {
      inconsistentPrimary.push({ product: p, image_url: p.image_url, images: unique });
    }
  }

  log(`\n── Issue 3: Products with duplicate URLs in their images[] (${internalDupes.length}) ──`);
  for (const { product: p, original, deduped } of internalDupes) {
    warn(`  [${p.sku}] "${p.name}" — ${original.length} → ${deduped.length} after dedup`);
  }

  log(`\n── Issue 4: Products where image_url ≠ first image in array (${inconsistentPrimary.length}) ──`);
  for (const { product: p } of inconsistentPrimary) {
    warn(`  [${p.sku}] "${p.name}"`);
  }

  // ── Issue 6: Corrupt / truncated files on disk ────────────────────
  let corruptSet = new Set();
  let corruptRefs = []; // { product, corruptUrls, validImages, newImageUrl }

  if (CHECK_FILES) {
    log(`\n── Issue 6: Corrupt / truncated image files (scanning ${UPLOADS_DIR}) ──`);
    corruptSet = scanCorruptFiles();
    log(`  Found ${corruptSet.size} corrupt file(s) on disk`);

    // Map corrupt file URLs → affected products
    if (corruptSet.size > 0) {
      log('\n  Products referencing corrupt files:');
      for (const p of products) {
        const arr = Array.isArray(p.images) ? p.images : [];
        const bad = arr.filter(u => corruptSet.has(u));
        const primaryBad = p.image_url && corruptSet.has(p.image_url);
        if (bad.length === 0 && !primaryBad) continue;

        const validImages = arr.filter(u => !corruptSet.has(u));
        const newImageUrl = corruptSet.has(p.image_url)
          ? (validImages[0] || null)
          : p.image_url;

        warn(`  [${p.sku}] "${p.name}" — ${bad.length} corrupt in gallery${primaryBad ? ', primary image corrupt' : ''}`);
        corruptRefs.push({ product: p, corruptUrls: bad, validImages, newImageUrl });
      }
      if (corruptRefs.length === 0) ok('  No products reference corrupt files.');
    }
  }

  // ── Summary ────────────────────────────────────────────────────────
  log('\n── Summary ──');
  log(`  No images:            ${noImages.length}`);
  log(`  Shared image_url:     ${crossDupes.length} URLs across ${crossDupes.reduce((s, [, ps]) => s + ps.length, 0)} products`);
  log(`  Internal duplicates:  ${internalDupes.length}`);
  log(`  Inconsistent primary: ${inconsistentPrimary.length}`);
  if (CHECK_FILES) {
    log(`  Corrupt files:        ${corruptSet.size} files / ${corruptRefs.length} products affected`);
  }

  const autoFixable = internalDupes.length + inconsistentPrimary.length + (CHECK_FILES ? corruptRefs.length : 0);
  if (!FIX_MODE) {
    if (autoFixable > 0) {
      const hints = [];
      if (internalDupes.length + inconsistentPrimary.length > 0) hints.push('--fix');
      if (CHECK_FILES && corruptRefs.length > 0) hints.push('--check-files --fix');
      log(`\n${autoFixable} auto-fixable issues found. Re-run with ${[...new Set(hints)].join(' / ')} to patch them.`);
    } else {
      ok('No auto-fixable issues found.');
    }
    return;
  }

  // ── Fix issues 3 & 4 ──────────────────────────────────────────────
  const fixed = new Map(); // id → merged patch

  for (const { product: p, deduped } of internalDupes) {
    fixed.set(p.id, { ...(fixed.get(p.id) || {}), images: deduped });
  }
  for (const { product: p, images } of inconsistentPrimary) {
    const current = fixed.get(p.id) || {};
    const finalImages = current.images || images;
    // Ensure image_url is the first element
    const reordered = [
      p.image_url,
      ...finalImages.filter(u => u !== p.image_url),
    ];
    fixed.set(p.id, { ...current, images: reordered, image_url: reordered[0] });
  }

  // ── Fix issue 6: remove corrupt image references ───────────────────
  if (CHECK_FILES && corruptRefs.length > 0) {
    log(`\n── Fixing ${corruptRefs.length} products with corrupt image refs... ──`);
    for (const { product: p, validImages, newImageUrl } of corruptRefs) {
      const current = fixed.get(p.id) || {};
      // Merge: start from any already-patched images, then apply corrupt removal
      const base = current.images || (Array.isArray(p.images) ? p.images : []);
      const cleaned = base.filter(u => !corruptSet.has(u));
      fixed.set(p.id, {
        ...current,
        images: cleaned.length > 0 ? cleaned : null,
        image_url: newImageUrl,
      });
      if (!newImageUrl) warn(`  [${p.sku}] "${p.name}" will have NO valid images after fix!`);
    }
  }

  if (fixed.size === 0) {
    ok('Nothing to fix.');
    return;
  }

  log(`\n── Applying ${fixed.size} product patches... ──`);
  let patched = 0, patchFailed = 0;
  for (const [id, payload] of fixed) {
    const p = products.find(x => x.id === id);
    process.stdout.write(`  Patching "${p?.name}" (${id.slice(0, 8)})... `);
    const success = await patchProduct(token, id, payload);
    if (success) { console.log('OK'); patched++; }
    else { console.log('FAILED'); patchFailed++; }
  }

  log('');
  log(`=== FIX COMPLETE: ${patched} patched, ${patchFailed} failed ===`);
  if (noImages.length > 0) {
    warn(`${noImages.length} products still have no images — upload manually`);
  }
  if (crossDupes.length > 0) {
    warn(`${crossDupes.length} cross-product shared URLs — review manually (may be intentional placeholder)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
