#!/usr/bin/env node
/**
 * Sync Product Images to Production
 *
 * Uploads local product images to the backend and patches each product's
 * image_url / images fields. Run this after the bulk import was done
 * locally but images need to reach the production server.
 *
 * Usage:
 *   BACKEND_URL=https://plannivo.com node scripts/sync-product-images.mjs
 *   BACKEND_URL=https://plannivo.com node scripts/sync-product-images.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Allow self-signed / staging certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE_URL       = process.env.BACKEND_URL       || 'https://plannivo.com';
const ADMIN_EMAIL    = process.env.IMPORT_ADMIN_EMAIL    || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.IMPORT_ADMIN_PASSWORD || 'asdasd35';
const DATA_DIR       = path.join(ROOT, 'DuotoneFonts', 'downloads');
const DRY_RUN        = process.argv.includes('--dry-run');
const IMAGE_BATCH    = 20;
const DELAY_MS       = 400; // between product uploads (rate-limit friendly)

const log  = (m) => console.log(`[Sync] ${m}`);
const warn = (m) => console.log(`[Sync] ⚠ ${m}`);
const ok   = (m) => console.log(`[Sync] ✓ ${m}`);
const err  = (m) => console.log(`[Sync] ✗ ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Local product discovery ──────────────────────────────────────────
function discoverProducts(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    const jsonPath = path.join(full, 'product-import.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        results.push({ jsonPath, productDir: full, data });
      } catch { /* skip */ }
    }
    results.push(...discoverProducts(full));
  }
  return results;
}

function getLocalImages(productDir) {
  let imgDir = path.join(productDir, 'images');
  if (!fs.existsSync(imgDir)) imgDir = path.join(productDir, 'highres');
  if (!fs.existsSync(imgDir)) return [];
  return fs.readdirSync(imgDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] || '0', 10);
      return na - nb;
    })
    .map(f => path.join(imgDir, f));
}

// ── Auth ────────────────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json();
  if (body.requires2FA) throw new Error('2FA enabled');
  if (!res.ok || !body.token) throw new Error(`Login failed: ${body.error || res.statusText}`);
  return body.token;
}

// ── Bulk-load all production products → SKU map ──────────────────────
// Uses authenticated requests (bypasses nothing, but each paginated call
// counts as ONE request instead of one per product).
async function loadAllProductSkus(token) {
  const skuMap = new Map(); // sku → { id, image_url, images }
  let page = 1;
  const pageSize = 200;

  log('Loading all products from production (paginated)...');
  while (true) {
    const res = await fetch(
      `${BASE_URL}/api/products?page=${page}&limit=${pageSize}&status=all`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      warn(`Page ${page} returned ${res.status} — stopping pagination`);
      break;
    }
    const body = await res.json();
    const products = body.products || body.data || [];
    if (products.length === 0) break;

    for (const p of products) {
      if (p.sku) skuMap.set(p.sku, { id: p.id, image_url: p.image_url, images: p.images });
    }
    log(`  Page ${page}: loaded ${products.length} products (total so far: ${skuMap.size})`);

    if (products.length < pageSize) break; // last page
    page++;
    await sleep(500); // be polite between paginated calls
  }
  return skuMap;
}

// ── Upload images ────────────────────────────────────────────────────
async function uploadImages(token, imagePaths) {
  if (imagePaths.length === 0) return [];
  const allUrls = [];
  for (let i = 0; i < imagePaths.length; i += IMAGE_BATCH) {
    const batch = imagePaths.slice(i, i + IMAGE_BATCH);
    const formData = new FormData();
    for (const imgPath of batch) {
      const buffer = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      formData.append('images', new Blob([buffer], { type: mime }), path.basename(imgPath));
    }
    const res = await fetch(`${BASE_URL}/api/upload/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { warn(`Image batch upload failed (${res.status})`); continue; }
    const body = await res.json();
    if (body.images) allUrls.push(...body.images.map(img => img.url));
  }
  return allUrls;
}

// ── Patch product images ─────────────────────────────────────────────
async function patchProductImages(token, productId, imageUrls) {
  const res = await fetch(`${BASE_URL}/api/products/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      image_url: imageUrls[0] || null,
      images: imageUrls.length > 0 ? imageUrls : null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: text };
  }
  return { ok: true };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  log(DRY_RUN ? '=== DRY RUN ===' : '=== STARTING IMAGE SYNC ===');
  log(`Backend: ${BASE_URL}`);

  // Discover local products, deduplicate by SKU
  const allEntries = discoverProducts(DATA_DIR);
  const skuMapLocal = new Map();
  for (const e of allEntries) {
    if (e.data.sku && !skuMapLocal.has(e.data.sku)) skuMapLocal.set(e.data.sku, e);
  }
  log(`Found ${skuMapLocal.size} unique products locally`);

  if (DRY_RUN) {
    for (const [sku, e] of skuMapLocal) {
      const imgs = getLocalImages(e.productDir);
      log(`  ${sku} "${e.data.name}" — ${imgs.length} images`);
    }
    log('=== DRY RUN COMPLETE ===');
    return;
  }

  // Login
  let token;
  try { token = await login(); ok('Logged in'); }
  catch (e) { err(`Login failed: ${e.message}`); process.exit(1); }

  // Load all production SKUs in bulk (few API calls instead of 320)
  const prodSkuMap = await loadAllProductSkus(token);
  log(`Production has ${prodSkuMap.size} products total`);

  let synced = 0, skipped = 0, failed = 0, notFound = 0;
  const entries = [...skuMapLocal.values()];

  for (let i = 0; i < entries.length; i++) {
    const { data, productDir } = entries[i];
    const label = `[${i + 1}/${entries.length}] "${data.name}"`;
    const images = getLocalImages(productDir);

    if (images.length === 0) {
      log(`${label} — no local images, skipping`);
      skipped++;
      continue;
    }

    const prod = prodSkuMap.get(data.sku);
    if (!prod) {
      warn(`${label} — SKU ${data.sku} not on production, skipping`);
      notFound++;
      continue;
    }

    // Detect locally-uploaded images by the local admin user ID in the filename.
    // Filenames look like: /uploads/images/image-{userId}-{timestamp}.png
    // If the URL contains the local admin UUID, it was uploaded to localhost and
    // doesn't exist on the production server — always re-sync.
    const LOCAL_ADMIN_ID = '82531f90-729b-4adb-9a05-0f53558e7c70';
    const isLocalUpload = prod.image_url && prod.image_url.includes(LOCAL_ADMIN_ID);
    if (!isLocalUpload && prod.image_url) {
      log(`${label} — image URL looks like a production URL, skipping`);
      skipped++;
      continue;
    }

    // Upload
    process.stdout.write(`${label} — uploading ${images.length} images... `);
    const urls = await uploadImages(token, images);
    if (urls.length === 0) {
      console.log('FAILED');
      failed++;
      continue;
    }
    console.log(`${urls.length} uploaded`);

    // Patch
    const result = await patchProductImages(token, prod.id, urls);
    if (result.ok) { ok(`${label} — updated`); synced++; }
    else { err(`${label} — update failed: ${result.message}`); failed++; }

    await sleep(DELAY_MS);
  }

  log('');
  log(`=== SYNC COMPLETE ===`);
  log(`Synced: ${synced} | Skipped: ${skipped} | Not found: ${notFound} | Failed: ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
