#!/usr/bin/env node
/**
 * Bulk Product Import Script
 * Reads scraped product data from downloads-ion-duotone/ and imports via the API.
 * Usage:
 *   node scripts/bulk-import-products.mjs              # full import
 *   node scripts/bulk-import-products.mjs --dry-run    # discovery + transform only, no API calls
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Config ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE_URL = process.env.VITE_BACKEND_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.IMPORT_ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.IMPORT_ADMIN_PASSWORD || 'asdasd35';
const DRY_RUN = process.argv.includes('--dry-run');
const IMAGE_BATCH_SIZE = 20;

// --folder KiteboardingAccessories  → only import products under that subfolder
const FOLDER_ARG = process.argv.find(a => a.startsWith('--folder='))?.split('=')[1]
  ?? (process.argv.indexOf('--folder') !== -1 ? process.argv[process.argv.indexOf('--folder') + 1] : null);
const DATA_DIR = FOLDER_ARG
  ? path.join(ROOT, 'DuotoneFonts', 'downloads', FOLDER_ARG)
  : path.join(ROOT, 'DuotoneFonts', 'downloads');

// ── Category Mapping ────────────────────────────────────────────────
// Scraped JSON `category` field → DB category + subcategory
const CATEGORY_MAP_BY_FIELD = {
  kites:      { category: 'kitesurf', subcategory: 'kites' },
  bars:       { category: 'kitesurf', subcategory: 'bars' },
  boards:     { category: 'kitesurf', subcategory: 'boards-twintips' },
  wetsuits:   { category: 'ion', subcategory: 'wetsuits' },
  // Wing foiling
  wings:      { category: 'wingfoil', subcategory: 'wings' },
  wingboards: { category: 'wingfoil', subcategory: 'boards' },
  // Foils (shared across disciplines)
  foils:      { category: 'foiling',  subcategory: 'foils' },
  kitefoils:  { category: 'foiling',  subcategory: 'foils' },
  downwind:   { category: 'foiling',  subcategory: 'foils' },
  // ION accessories
  footwear:          { category: 'ion', subcategory: 'footwear' },
  'neo-accessories': { category: 'ion', subcategory: 'ion-accs' },
  leashes:           { category: 'ion', subcategory: 'ion-accs-leash' },
  ponchos:           { category: 'ion', subcategory: 'apparel-ponchos' },
  apparel:           { category: 'ion', subcategory: 'apparel' },
  'board-accs':      { category: 'ion', subcategory: 'ion-accs' },
  'harnesses-kite':  { category: 'ion', subcategory: 'harnesses-kite' },
  'harnesses-wing':  { category: 'ion', subcategory: 'harnesses-wing' },
  harnesses:         { category: 'ion', subcategory: 'harnesses' },
  'spare-parts':     { category: 'ion', subcategory: 'ion-accs' },
  clothing:          { category: 'ion', subcategory: 'apparel' },
  // Duotone kiteboarding accessories
  'bindings-boots':  { category: 'kitesurf', subcategory: 'bindings-boots' },
  pumps:             { category: 'kitesurf', subcategory: 'pumps' },
};

// ── Product-name-based reclassification rules ──────────────────────

// Duotone surfboard models (directional boards, NOT twintips)
const SURFBOARD_MODELS = ['Blur', 'Volt', 'Whip', 'Provoke'];

// Products that are bags/accessories, not boards
const BAG_KEYWORDS = ['Combibag', 'Boardbag', 'Daypack', 'Team Bag', 'Travelbag'];

// Products miscategorised by the scraper (wrong category field entirely)
const NAME_OVERRIDES = {
  'Stash':      { category: 'kitesurf', subcategory: 'kites' },       // single-skin kite, not a bar/board
  'Vegas 2024': { category: 'kitesurf', subcategory: 'kites' },       // C-kite, not a bar
};

/** Refine Duotone board/bar subcategory based on product name */
function refineDuotoneSubcategory(name, scraperCategory) {
  // Check hard overrides first (Stash → kite, Vegas 2024 → kite)
  for (const [key, override] of Object.entries(NAME_OVERRIDES)) {
    if (name === key || name.startsWith(key + ' ')) return override;
  }

  if (scraperCategory === 'boards') {
    // Bags → accessories/board-bags
    if (BAG_KEYWORDS.some(kw => name.includes(kw))) {
      return { category: 'kitesurf', subcategory: 'board-bags' };
    }
    // Surfboards (directional) — match model name at start: "Blur D/LAB", "Volt SLS", etc.
    if (SURFBOARD_MODELS.some(m => name === m || name.startsWith(m + ' '))) {
      return { category: 'kitesurf', subcategory: 'boards-surfboards' };
    }
    // Everything else stays twintip
  }

  return null; // no override
}

/** Detect ION wetsuit gender and type from product name (overrides folder path) */
function refineWetsuitFromName(name) {
  const lower = name.toLowerCase();

  // Drysuits are a special case — keep under fullsuits for now
  const isDrysuit = lower.includes('drysuit');

  // Gender: product name is authoritative ("Men Wetsuit..." / "...Women" / "Unisex")
  let gender = null;
  if (/\bmen\b/i.test(name) && !/\bwomen\b/i.test(name)) gender = 'men';
  else if (/\bwomen\b/i.test(name)) gender = 'women';
  else if (/\bunisex\b/i.test(name)) gender = 'men'; // unisex drysuits → file under men

  // Type: fullsuit vs springsuit/shorty
  let type = 'fullsuits'; // default
  if (/shorty|shortsleeve|short sleeve|springsuit|monoshorty|long john|overknee|protection suit/i.test(name)) {
    type = 'springsuits';
  }
  // Thickness hint: 2/2 and thinner are springsuits, 3/2+ can be either but overknee/SS variants are springsuits
  const thicknessMatch = name.match(/(\d+)\/(\d+)/);
  if (thicknessMatch) {
    const top = parseInt(thicknessMatch[1]);
    if (top <= 2 && !isDrysuit) type = 'springsuits';
  }

  if (!gender) return null; // can't determine, fall through to folder logic
  return `wetsuits-${gender}-${type}`;
}

// ── Helpers ─────────────────────────────────────────────────────────
const log = (msg) => console.log(`[Import] ${msg}`);
const warn = (msg) => console.log(`[Import] ⚠ ${msg}`);
const err = (msg) => console.log(`[Import] ✗ ${msg}`);
const ok = (msg) => console.log(`[Import] ✓ ${msg}`);

/** Derive brand and gender from the product folder path relative to DATA_DIR */
function inferFromPath(productDir) {
  const rel = path.relative(DATA_DIR, productDir).split(path.sep);
  // rel e.g. ["Duotone", "Kites", "SLS", "Evo SLS"]
  //          ["ION", "Wetsuits", "Men", "men-fullsuit", "Element 4-3..."]
  //          ["ION", "Wetsuits", "Unisex", "women-fullsuit", "..."]
  const brand = rel[0] === 'ION' ? 'ION' : rel[0] === 'Duotone' ? 'Duotone' : null;

  // Gender from folder path
  let gender = null;
  const pathStr = rel.join('/').toLowerCase();
  if (pathStr.includes('/men/') || pathStr.includes('/men-')) gender = 'Men';
  else if (pathStr.includes('/women/') || pathStr.includes('/women-')) gender = 'Women';
  // Unisex folder may contain men/women subfolders — subfolder name takes priority
  if (rel.includes('Unisex')) {
    const sub = rel.find(s => s.startsWith('men-') || s.startsWith('women-'));
    if (sub) gender = sub.startsWith('women') ? 'Women' : 'Men';
  }

  // Wetsuit subcategory refinement from subfolder
  let wetsuitSub = null;
  const subFolder = rel.find(s => /^(men|women)-(fullsuit|shorty|long)$/.test(s));
  if (subFolder) {
    const [g, type] = subFolder.split('-');
    const genderPrefix = g === 'men' ? 'men' : 'women';
    const typeMap = { fullsuit: 'fullsuits', shorty: 'springsuits', long: 'fullsuits' };
    wetsuitSub = `wetsuits-${genderPrefix}-${typeMap[type] || type}`;
  }

  return { brand, gender, wetsuitSub };
}

/** Recursively find all product-import.json files */
function discoverProducts(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Check if this directory has a product-import.json
      const jsonPath = path.join(full, 'product-import.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          results.push({ jsonPath, productDir: full, data });
        } catch (e) {
          warn(`Failed to parse ${jsonPath}: ${e.message}`);
        }
      }
      // Continue recursing (there may be nested product folders)
      results.push(...discoverProducts(full));
    }
  }
  return results;
}

/** Get all image files from a product directory (checks images/ then highres/) */
function getLocalImages(productDir) {
  // New data uses 'images/', old data used 'highres/'
  let imgDir = path.join(productDir, 'images');
  if (!fs.existsSync(imgDir)) imgDir = path.join(productDir, 'highres');
  if (!fs.existsSync(imgDir)) return [];
  return fs.readdirSync(imgDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => {
      // Sort by numeric suffix in filename
      const numA = parseInt(a.match(/(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    })
    .map(f => path.join(imgDir, f));
}

// ── Auth ────────────────────────────────────────────────────────────
async function login() {
  log(`Logging in as ${ADMIN_EMAIL} at ${BASE_URL}...`);
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json();
  if (body.requires2FA) {
    throw new Error('Account has 2FA enabled. Disable 2FA or use a non-2FA admin account.');
  }
  if (!res.ok || !body.token) {
    throw new Error(`Login failed: ${body.error || body.message || res.statusText}`);
  }
  return body.token;
}

// ── Image Upload ────────────────────────────────────────────────────
async function uploadImages(token, imagePaths) {
  if (imagePaths.length === 0) return [];

  const allUrls = [];
  // Batch in groups of IMAGE_BATCH_SIZE
  for (let i = 0; i < imagePaths.length; i += IMAGE_BATCH_SIZE) {
    const batch = imagePaths.slice(i, i + IMAGE_BATCH_SIZE);
    const formData = new FormData();
    for (const imgPath of batch) {
      const buffer = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const blob = new Blob([buffer], { type: mime });
      formData.append('images', blob, path.basename(imgPath));
    }

    const res = await fetch(`${BASE_URL}/api/upload/images`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      warn(`Image upload batch failed (${res.status}): ${text}`);
      continue;
    }

    const body = await res.json();
    if (body.images) {
      allUrls.push(...body.images.map(img => img.url));
    }
  }
  return allUrls;
}

// ── Transform ───────────────────────────────────────────────────────
function transformProduct(entry, uploadedUrls) {
  const { data, productDir } = entry;

  // Category mapping from the JSON `category` field (kites, bars, boards, wetsuits)
  const catField = (data.category || '').toLowerCase().trim();
  const mapped = CATEGORY_MAP_BY_FIELD[catField];
  if (!mapped) {
    return { error: `Unknown category field: "${catField}" (${productDir})` };
  }

  // Brand + gender + wetsuit subcategory from folder path
  const pathInfo = inferFromPath(productDir);
  const brand = pathInfo.brand || data.brand;

  // Smart subcategory: product name overrides scraper's blind folder mapping
  let resolvedCategory = mapped.category;
  let subcategory = mapped.subcategory;

  // Duotone: fix boards (surfboards vs twintips vs bags) and misplaced kites in bars
  const duotoneOverride = refineDuotoneSubcategory(data.name, catField);
  if (duotoneOverride) {
    resolvedCategory = duotoneOverride.category;
    subcategory = duotoneOverride.subcategory;
  }

  // ION wetsuits: product name is authoritative for gender + type
  if (catField === 'wetsuits') {
    const nameBasedSub = refineWetsuitFromName(data.name);
    if (nameBasedSub) {
      subcategory = nameBasedSub;
    } else if (pathInfo.wetsuitSub) {
      subcategory = pathInfo.wetsuitSub;
    } else if (pathInfo.gender) {
      subcategory = `wetsuits-${pathInfo.gender.toLowerCase()}`;
    }
  }

  // Variants
  let variants = null;
  let derivedPrice = data.price ?? 0;
  let derivedCostPrice = data.cost_price ?? null;
  let originalPrice = null;

  if (Array.isArray(data.variants) && data.variants.length > 0) {
    // Filter out null/empty variants
    const validVariants = data.variants.filter(v => v.label != null || v.price != null);

    // Deduplicate by label
    const seen = new Set();
    const deduped = [];
    for (const v of validVariants) {
      const key = v.label || v.size || `size-${v.size_sqm}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(v);
      }
    }

    // Distribute stock evenly across variants
    const totalStock = data.stock_quantity || 0;
    const perVariant = deduped.length > 0 ? Math.floor(totalStock / deduped.length) : 0;
    const remainder = deduped.length > 0 ? totalStock % deduped.length : 0;

    variants = deduped.map((v, idx) => ({
      key: idx,
      label: v.label || v.size || `${v.size_sqm}`,
      quantity: perVariant + (idx < remainder ? 1 : 0),
      price: v.price ?? null,
      price_final: v.price_final ?? null,
      cost_price: v.cost_price ?? null,
    }));

    // Derive product-level price from variants (min non-null price)
    const prices = variants.map(v => v.price).filter(p => p != null && p > 0);
    if (prices.length > 0) derivedPrice = Math.min(...prices);

    const costs = variants.map(v => v.cost_price).filter(p => p != null && p > 0);
    if (costs.length > 0) derivedCostPrice = Math.min(...costs);

    // Original price = max price_final (the RRP / "before discount" price)
    const finals = variants.map(v => v.price_final).filter(p => p != null && p > 0);
    if (finals.length > 0) originalPrice = Math.max(...finals);
  }

  return {
    body: {
      name: data.name,
      description: data.description || null,
      description_detailed: null,
      sku: data.sku,
      category: resolvedCategory,
      subcategory,
      brand,
      price: derivedPrice,
      cost_price: derivedCostPrice,
      original_price: originalPrice,
      currency: data.currency || 'EUR',
      stock_quantity: data.stock_quantity || 0,
      min_stock_level: data.min_stock_level || 0,
      weight: null,
      dimensions: null,
      image_url: uploadedUrls[0] || null,
      images: uploadedUrls.length > 0 ? uploadedUrls : null,
      status: data.status || 'active',
      is_featured: data.is_featured || false,
      tags: data.tags || [],
      supplier_info: null,
      variants,
      colors: null,
      gender: pathInfo.gender || null,
      sizes: null,
      source_url: data.source_url || null,
    },
  };
}

// ── Create Product ──────────────────────────────────────────────────
async function createProduct(token, body) {
  const res = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json();

  if (res.status === 400 && responseBody.message?.includes('SKU already exists')) {
    return { status: 'skipped', message: 'SKU already exists' };
  }
  if (!res.ok) {
    return { status: 'failed', message: responseBody.message || responseBody.error || res.statusText };
  }
  return { status: 'created', id: responseBody.id };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== STARTING IMPORT ===');
  log(`Data directory: ${DATA_DIR}`);
  log(`Backend: ${BASE_URL}`);
  if (FOLDER_ARG) log(`Folder filter: ${FOLDER_ARG}`);

  // 1. Discover
  const allEntries = discoverProducts(DATA_DIR);
  log(`Discovered ${allEntries.length} product files`);

  // 2. Deduplicate by SKU
  const skuMap = new Map();
  const dupes = [];
  for (const entry of allEntries) {
    const sku = entry.data.sku;
    if (!sku) {
      warn(`Product without SKU in ${entry.productDir} — skipping`);
      continue;
    }
    if (skuMap.has(sku)) {
      dupes.push({ sku, path: entry.productDir });
    } else {
      skuMap.set(sku, entry);
    }
  }
  const entries = [...skuMap.values()];
  if (dupes.length > 0) {
    warn(`${dupes.length} duplicate SKUs removed: ${dupes.map(d => d.sku).join(', ')}`);
  }
  log(`${entries.length} unique products to import`);

  if (DRY_RUN) {
    log('--- Dry run: showing transformations ---');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const images = getLocalImages(entry.productDir);
      const result = transformProduct(entry, images.map((_, idx) => `/uploads/images/placeholder-${idx}.png`));
      if (result.error) {
        err(`[${i + 1}/${entries.length}] ${entry.data.name}: ${result.error}`);
      } else {
        const b = result.body;
        const variantInfo = b.variants ? `${b.variants.length} variants` : 'no variants';
        log(`[${i + 1}/${entries.length}] "${b.name}" → ${b.category}/${b.subcategory} | ${b.brand} | €${b.price} | ${images.length} imgs | ${variantInfo}`);
      }
    }
    log('=== DRY RUN COMPLETE ===');
    return;
  }

  // 3. Login
  let token;
  try {
    token = await login();
    ok('Logged in successfully');
  } catch (e) {
    err(`Login failed: ${e.message}`);
    process.exit(1);
  }

  // 4. Import each product
  let created = 0, skipped = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = `[${i + 1}/${entries.length}]`;

    // Upload images
    const imagePaths = getLocalImages(entry.productDir);
    let uploadedUrls = [];
    if (imagePaths.length > 0) {
      process.stdout.write(`${label} Uploading ${imagePaths.length} images for "${entry.data.name}"... `);
      try {
        uploadedUrls = await uploadImages(token, imagePaths);
        console.log(`${uploadedUrls.length} uploaded`);
      } catch (e) {
        console.log(`FAILED (${e.message})`);
      }
    }

    // Transform
    const result = transformProduct(entry, uploadedUrls);
    if (result.error) {
      err(`${label} ${entry.data.name}: ${result.error}`);
      failed++;
      failures.push({ name: entry.data.name, reason: result.error });
      continue;
    }

    // Create
    process.stdout.write(`${label} Creating "${result.body.name}" (${result.body.category}/${result.body.subcategory})... `);
    try {
      const res = await createProduct(token, result.body);
      if (res.status === 'created') {
        console.log('OK');
        created++;
      } else if (res.status === 'skipped') {
        console.log('SKIPPED (SKU exists)');
        skipped++;
      } else {
        console.log(`FAILED: ${res.message}`);
        failed++;
        failures.push({ name: result.body.name, reason: res.message });
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      failed++;
      failures.push({ name: result.body.name, reason: e.message });
    }
  }

  // 5. Summary
  log('');
  log('=== IMPORT COMPLETE ===');
  log(`Total: ${entries.length} | Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
  if (failures.length > 0) {
    log('Failed products:');
    for (const f of failures) {
      log(`  - ${f.name}: ${f.reason}`);
    }
  }
}

main().catch(e => {
  err(`Fatal error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
