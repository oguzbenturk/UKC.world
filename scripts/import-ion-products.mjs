#!/usr/bin/env node
/*
Import ION products script
- Scans a folder for product-import.json files
- Skips products where price is missing (per request)
- Uploads product images to /api/upload/images
- Creates products via /api/products (only when --commit is passed)

Usage:
  node ./scripts/import-ion-products.mjs --ion-dir="d:/kspro-plannivo/tools/downloads-ion-duotone/ION" --api-url="https://www.plannivo.com" --commit --concurrency=4

Env vars (can be in .env):
  ADMIN_EMAIL
  ADMIN_PASSWORD
  API_URL (optional, overriden by --api-url)
  ION_DIR (optional, overriden by --ion-dir)

By default script runs in dry-run mode (no product creation). Use --commit to apply changes.
*/

import dotenv from 'dotenv';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import pLimit from 'p-limit';

dotenv.config();

const argv = process.argv.slice(2);
const argMap = argv.reduce((acc, a) => {
  if (a.startsWith('--')) {
    const [k, v] = a.replace(/^--/, '').split('=');
    acc[k] = v === undefined ? true : v;
  }
  return acc;
}, {});

const API_URL = (argMap['api-url'] || process.env.API_URL || process.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
const ION_DIR = argMap['ion-dir'] || process.env.ION_DIR || process.env.ION_PRODUCT_DIR || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD;
const CONCURRENCY = Number(argMap.concurrency || process.env.ION_IMPORT_CONCURRENCY || 5);
const COMMIT = !!argMap.commit;
const REPORT_PATH = path.resolve(process.cwd(), 'scripts', 'import-ion-products-report.json');

if (!API_URL) {
  console.error('Error: API_URL is required. Provide --api-url or set API_URL env var.');
  process.exit(1);
}
if (!ION_DIR) {
  console.error('Error: ION_DIR is required. Provide --ion-dir or set ION_DIR env var.');
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD are required in env.');
  process.exit(1);
}

const allowedCategories = ['kites','boards','harnesses','wetsuits','equipment','accessories','apparel','safety','other'];

async function login() {
  try {
    const url = `${API_URL}/api/auth/login`;
    const res = await axios.post(url, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }, { timeout: 15000 });

    const token = res?.data?.token;
    if (!token) throw new Error('No token returned from login');
    console.log('✅ Auth successful, token obtained');
    return token;
  } catch (err) {
    console.error('Auth failed:', err?.response?.data || err.message);
    throw err;
  }
}

async function findProductJsonFiles(dir) {
  const results = [];
  async function walker(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) {
        await walker(p);
      } else if (e.isFile() && e.name === 'product-import.json') {
        results.push(p);
      }
    }
  }
  await walker(dir);
  return results;
}

async function uploadImagesForProduct(token, productDir, images) {
  if (!images || images.length === 0) return { urls: [] };

  // Filter out missing files and warn
  const existingFiles = images.map(img => path.join(productDir, img)).filter(fp => fsSync.existsSync(fp));
  if (existingFiles.length === 0) return { urls: [] };

  const form = new FormData();
  for (const filePath of existingFiles) {
    form.append('images', fsSync.createReadStream(filePath));
  }

  const headers = {
    ...form.getHeaders(),
    Authorization: `Bearer ${token}`
  };

  try {
    const res = await axios.post(`${API_URL}/api/upload/images`, form, {
      headers,
      maxBodyLength: Infinity,
      timeout: 60000
    });

    const uploaded = res.data?.images || [];
    const urls = uploaded.map(i => i.url);
    return { urls, uploaded };
  } catch (err) {
    console.error('Image upload failed for', productDir, err?.response?.data || err.message);
    return { urls: [], error: err?.response?.data || err.message };
  }
}

function mapCategory(rawCategory) {
  if (!rawCategory) return 'other';
  const lower = rawCategory.toLowerCase();
  for (const c of allowedCategories) {
    if (lower.includes(c)) return c;
  }
  // Try split by / and pick the middle segment if it matches
  const parts = rawCategory.split('/').map(p => p.toLowerCase());
  for (const p of parts) {
    if (allowedCategories.includes(p)) return p;
  }
  return 'other';
}

async function createProduct(token, payload) {
  try {
    const res = await axios.post(`${API_URL}/api/products`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    });
    return { success: true, data: res.data };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message };
  }
}

(async function main(){
  console.log(`Starting ION import: dir=${ION_DIR} api=${API_URL} concurrency=${CONCURRENCY} commit=${COMMIT}`);

  const token = await login();
  const files = await findProductJsonFiles(ION_DIR);
  console.log(`Found ${files.length} product JSON files`);

  const limit = pLimit(CONCURRENCY);

  const report = {
    scanned: files.length,
    skipped_no_price: [],
    skipped_missing_images: [],
    uploaded_images_count: 0,
    products_created: [],
    products_failed: [],
    dryRun: !COMMIT
  };

  const tasks = files.map(file => limit(async () => {
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8'));
      const productDir = path.dirname(file);

      // Skip if no price (per your instruction)
      if (raw.price === null || raw.price === undefined) {
        report.skipped_no_price.push({ file, name: raw.name, sku: raw.sku });
        console.log(`⏭ Skipping (no price): ${raw.name} (${file})`);
        return;
      }

      // Upload images
      const imgs = Array.isArray(raw.images) ? raw.images : (raw.image_url ? [raw.image_url] : []);
      const uploadResult = await uploadImagesForProduct(token, productDir, imgs);
      if (uploadResult.error) {
        report.products_failed.push({ file, name: raw.name, error: uploadResult.error });
        console.warn(`⚠️ Image upload error for ${raw.name}:`, uploadResult.error);
        return;
      }

      if (!uploadResult.urls || uploadResult.urls.length === 0) {
        report.skipped_missing_images.push({ file, name: raw.name, sku: raw.sku });
        console.log(`⚠️ No images uploaded for ${raw.name}, skipping creation`);
        return;
      }

      report.uploaded_images_count += uploadResult.urls.length;

      const payload = {
        name: raw.name,
        description: raw.description || null,
        sku: raw.sku || null,
        category: mapCategory(raw.category),
        brand: raw.brand || null,
        price: Number(raw.price),
        cost_price: raw.cost_price != null ? Number(raw.cost_price) : null,
        currency: raw.currency || 'EUR',
        stock_quantity: raw.stock_quantity != null ? Number(raw.stock_quantity) : 0,
        min_stock_level: raw.min_stock_level != null ? Number(raw.min_stock_level) : 0,
        image_url: uploadResult.urls[0],
        images: uploadResult.urls,
        status: raw.status || 'active',
        is_featured: !!raw.is_featured,
        tags: raw.tags || [],
        supplier_info: {
          vendor: 'ion',
          sourceUrl: raw.source_url || null,
          lastImportedAt: new Date().toISOString()
        }
      };

      if (!COMMIT) {
        console.log(`DRY-RUN: Prepared product (not created): ${payload.name} | price=${payload.price} | images=${payload.images.length}`);
        report.products_created.push({ file, name: payload.name, sku: payload.sku, dryRun: true });
        return;
      }

      const res = await createProduct(token, payload);
      if (res.success) {
        console.log(`✅ Created product: ${payload.name} (id=${res.data.id})`);
        report.products_created.push({ file, name: payload.name, sku: payload.sku, id: res.data.id });
      } else {
        console.error(`❌ Failed to create product: ${payload.name}`, res.error);
        report.products_failed.push({ file, name: payload.name, error: res.error });
      }

    } catch (err) {
      console.error('Unexpected error processing', file, err?.message || err);
      report.products_failed.push({ file, error: err?.message || String(err) });
    }
  }));

  await Promise.all(tasks);

  // Write report
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n--- SUMMARY ---');
  console.log(`Scanned: ${report.scanned}`);
  console.log(`Skipped (no price): ${report.skipped_no_price.length}`);
  console.log(`Skipped (missing images): ${report.skipped_missing_images.length}`);
  console.log(`Uploaded images count: ${report.uploaded_images_count}`);
  console.log(`Products created: ${report.products_created.length} (dryRun=${report.dryRun})`);
  console.log(`Products failed: ${report.products_failed.length}`);
  console.log(`Report written to ${REPORT_PATH}`);

  process.exit(0);
})();
