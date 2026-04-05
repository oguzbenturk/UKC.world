/**
 * Duotone Product Scraper
 *
 * Scrapes product data from duotonesports.com via their public API
 * and saves in the same format as the existing DuotoneFonts/downloads/ structure.
 *
 * Usage:
 *   node scripts/scrape-duotone.mjs              # full scrape (download images)
 *   node scripts/scrape-duotone.mjs --dry-run    # list products only, no downloads
 *   node scripts/scrape-duotone.mjs --no-images  # save JSON only, skip image downloads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'DuotoneFonts', 'downloads', 'Duotone');

const DRY_RUN    = process.argv.includes('--dry-run');
const NO_IMAGES  = process.argv.includes('--no-images');

// --categories bindings-boots,pumps  → only scrape those categories
const CATEGORIES_ARG = process.argv.find(a => a.startsWith('--categories='))?.split('=')[1]
  ?? (process.argv.indexOf('--categories') !== -1 ? process.argv[process.argv.indexOf('--categories') + 1] : null);
const FILTER_CATEGORIES = CATEGORIES_ARG ? new Set(CATEGORIES_ARG.split(',').map(s => s.trim())) : null;
const API_BASE = 'https://api.boards-more.com/products/by_article_number';
const DUOTONE_BASE = 'https://www.duotonesports.com';
const ION_BASE = 'https://www.ion-products.com';

// ── Category Pages to Scrape ────────────────────────────────────────
// Each entry: URL → folder + category + brand
// brand controls the output root folder: Duotone/ or ION/
const CATEGORY_PAGES = [
  // ─── Duotone: Wing Foiling ────────────────────────────────────────
  { url: `${DUOTONE_BASE}/en/wing-foiling/wings`,                            folder: 'WingFoiling/Wings',              category: 'wings',      brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/wing-foiling/boards/wing-foiling-boards`,       folder: 'WingFoiling/Boards',             category: 'wingboards', brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/wing-foiling/foils/front-wings/front-wings`,    folder: 'WingFoiling/Foils/FrontWings',   category: 'foils',      brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/wing-foiling/foils/masts/masts`,               folder: 'WingFoiling/Foils/Masts',        category: 'foils',      brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/wing-foiling/foils/back-wings/back-wings`,     folder: 'WingFoiling/Foils/BackWings',    category: 'foils',      brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/wing-foiling/foils/fuselages/fuselages`,       folder: 'WingFoiling/Foils/Fuselages',    category: 'foils',      brand: 'Duotone' },
  // ─── Duotone: Kiteboarding Foils ──────────────────────────────────
  { url: `${DUOTONE_BASE}/en/kiteboarding/foils/front-and-back-wings`,      folder: 'KiteboardingFoils/Wings',        category: 'kitefoils',  brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/kiteboarding/foils/masts-and-fuselages`,       folder: 'KiteboardingFoils/Masts',        category: 'kitefoils',  brand: 'Duotone' },
  // ─── Duotone: Downwind ────────────────────────────────────────────
  { url: `${DUOTONE_BASE}/en/foiling-electric/disciplines/downwind-foiling`, folder: 'Downwind',                       category: 'downwind',   brand: 'Duotone' },

  // ─── ION: Footwear ────────────────────────────────────────────────
  { url: `${ION_BASE}/en/water/accessories/neoprene-shoes`,                                folder: 'Footwear',                     category: 'footwear',         brand: 'ION' },
  // ─── ION: Neoprene Accessories ────────────────────────────────────
  { url: `${ION_BASE}/en/water/accessories/neoprene-accessories/neoprene-gloves`,          folder: 'NeopreneAccessories/Gloves',   category: 'neo-accessories',  brand: 'ION' },
  { url: `${ION_BASE}/en/water/accessories/neoprene-accessories/neoprene-hoods`,           folder: 'NeopreneAccessories/Hoods',    category: 'neo-accessories',  brand: 'ION' },
  // ─── ION: Leashes ────────────────────────────────────────────────
  { url: `${ION_BASE}/en/water/accessories/leashes/kite-leashes`,                          folder: 'Leashes',                      category: 'leashes',          brand: 'ION' },
  // ─── ION: Apparel & Accessories ───────────────────────────────────
  { url: `${ION_BASE}/en/water/accessories/surf-ponchos`,                                  folder: 'Apparel/Ponchos',              category: 'ponchos',          brand: 'ION' },
  { url: `${ION_BASE}/en/water/accessories/surf-hats-and-caps`,                            folder: 'Apparel/HatsCaps',             category: 'apparel',          brand: 'ION' },
  { url: `${ION_BASE}/en/water/accessories/board-accessories`,                             folder: 'BoardAccessories',             category: 'board-accs',       brand: 'ION' },
  // ─── ION: Harnesses ──────────────────────────────────────────────
  { url: `${ION_BASE}/en/water/men/harnesses/kiteboarding-harnesses`,                      folder: 'Harnesses/KiteMen',            category: 'harnesses-kite',   brand: 'ION' },
  { url: `${ION_BASE}/en/water/women/harnesses/kiteboarding-harnesses`,                    folder: 'Harnesses/KiteWomen',          category: 'harnesses-kite',   brand: 'ION' },
  { url: `${ION_BASE}/en/water/wingfoil-harnesses`,                                       folder: 'Harnesses/Wing',               category: 'harnesses-wing',   brand: 'ION' },
  { url: `${ION_BASE}/en/water/harnesses/spreaderbars`,                                   folder: 'Harnesses/Spreaderbars',       category: 'harnesses',        brand: 'ION' },
  // ─── Duotone: Kiteboarding Accessories ──────────────────────────────
  { url: `${DUOTONE_BASE}/en/uk/kiteboarding/boards/bindings-boot`,                       folder: 'KiteboardingAccessories/BindingsBoots', category: 'bindings-boots', brand: 'Duotone' },
  { url: `${DUOTONE_BASE}/en/uk/kiteboarding/gear/pump`,                                 folder: 'KiteboardingAccessories/Pumps',         category: 'pumps',          brand: 'Duotone' },
  // ─── ION: Spare Parts ────────────────────────────────────────────
  { url: `${ION_BASE}/en/water/spareparts`,                                               folder: 'SpareParts',                   category: 'spare-parts',      brand: 'ION' },
  // ─── ION: Clothing ───────────────────────────────────────────────
  { url: `${ION_BASE}/en/water/women/clothing`,                                           folder: 'Clothing/Women',               category: 'clothing',         brand: 'ION' },
  { url: `${ION_BASE}/en/water/men/clothing`,                                             folder: 'Clothing/Men',                 category: 'clothing',         brand: 'ION' },
];

// ── Helpers ─────────────────────────────────────────────────────────
const log = (msg) => console.log(`[Scrape] ${msg}`);
const warn = (msg) => console.log(`[Scrape] ⚠ ${msg}`);
const ok = (msg) => console.log(`[Scrape] ✓ ${msg}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : reject;
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Plannivo Scraper)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchJSON(url) {
  return fetchText(url).then(JSON.parse);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Plannivo Scraper)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (e) => { fs.unlinkSync(dest); reject(e); });
    }).on('error', (e) => { file.close(); fs.unlinkSync(dest); reject(e); });
  });
}

// ── Step 1: Discover article numbers from category pages ────────────
async function discoverArticleNumbers(page) {
  log(`Fetching ${page.url}`);
  const html = await fetchText(page.url);
  // Match product links — works for both duotonesports.com and ion-products.com
  // Pattern: /en(/uk)?/products/{name}-{articleNumber}  where articleNumber = XXXXX-XXXX
  const matches = html.matchAll(/\/en(?:\/[a-z]{2})?\/products\/[^"]*?-(\d{5}-\d{4})/g);
  const articleNumbers = [...new Set([...matches].map((m) => m[1]))];
  return articleNumbers.map((an) => ({
    articleNumber: an,
    folder: page.folder,
    category: page.category,
    brand: page.brand,
  }));
}

// ── Step 2: Fetch product from API and transform ────────────────────
function transformProduct(apiData, category, brand) {
  const name = apiData.name || apiData.webname || 'Unknown';
  const sku = apiData.articleNumber;
  const description = (apiData.descriptionShort || apiData.description || '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .substring(0, 500);

  // Deduplicate variants by size (API returns per-color × per-size)
  const seenSizes = new Set();
  const variants = [];
  for (const v of apiData.variants || []) {
    const label = v.size || v.title || '';
    if (seenSizes.has(label)) continue;
    seenSizes.add(label);

    const price = parseFloat(v.price) || 0;
    // size_sqm for wings/kites (numeric like 3.0, 5.0)
    const numSize = parseFloat(label);
    const size_sqm = !isNaN(numSize) && numSize < 30 ? numSize : undefined;

    variants.push({
      label,
      ...(size_sqm !== undefined ? { size_sqm } : {}),
      price,
      price_final: price,
    });
  }

  // Derive base price (lowest variant price)
  const prices = variants.map((v) => v.price).filter((p) => p > 0);
  const price = prices.length > 0 ? Math.min(...prices) : apiData.fromPrice || 0;

  // Tags from product line, subline
  const tags = [];
  if (name.includes('SLS')) tags.push('SLS');
  if (name.includes('D/LAB') || name.includes('D-LAB')) tags.push('D/LAB');
  if (name.includes('Concept Blue')) tags.push('Concept Blue');
  const year = apiData.handle?.match(/20\d{2}/)?.[0];
  if (year) tags.push(year);

  // Source URL depends on brand
  const siteBase = brand === 'ION' ? ION_BASE : DUOTONE_BASE;

  return {
    name,
    sku,
    brand: brand || (apiData.brand === 'ion' ? 'ION' : 'Duotone'),
    category,
    description,
    price,
    stock_quantity: 0,
    currency: 'EUR',
    source_url: `${siteBase}/en/products/${apiData.handle}`,
    variants,
    tags,
  };
}

// ── Step 3: Download product images ─────────────────────────────────
function getImageUrls(apiData) {
  const pics = apiData.productPictures || [];
  return pics
    .map((p) => p.url)
    .filter(Boolean);
}

function getImageFilename(url, index) {
  // Try to extract color code from URL or use sequential naming
  const urlFilename = url.split('/').pop()?.split('?')[0] || '';
  const ext = path.extname(urlFilename) || '.png';
  // Use color code if available from the filename, otherwise sequential
  const colorMatch = urlFilename.match(/^([A-Z]\d{2})/i);
  const prefix = colorMatch ? colorMatch[1] : 'IMG';
  return `${prefix}-${index + 1}${ext}`;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== STARTING SCRAPE ===');
  log(`Output directory: ${OUT_DIR}`);
  if (FILTER_CATEGORIES) log(`Category filter: ${[...FILTER_CATEGORIES].join(', ')}`);

  // Step 1: Discover all products from category pages
  log('\n── Step 1: Discovering products from category pages ──');
  const allItems = [];
  const seenArticles = new Set();

  const activePages = FILTER_CATEGORIES
    ? CATEGORY_PAGES.filter(p => FILTER_CATEGORIES.has(p.category))
    : CATEGORY_PAGES;
  if (FILTER_CATEGORIES && activePages.length === 0) {
    warn(`No category pages matched filter: ${[...FILTER_CATEGORIES].join(', ')}`);
    return;
  }

  for (const page of activePages) {
    try {
      const items = await discoverArticleNumbers(page);
      let added = 0;
      for (const item of items) {
        if (!seenArticles.has(item.articleNumber)) {
          seenArticles.add(item.articleNumber);
          allItems.push(item);
          added++;
        }
      }
      log(`  ${page.folder}: ${items.length} found, ${added} new`);
    } catch (err) {
      warn(`  Failed to fetch ${page.url}: ${err.message}`);
    }
    await sleep(300);
  }

  log(`\nTotal unique products: ${allItems.length}`);

  if (allItems.length === 0) {
    warn('No products found. Exiting.');
    return;
  }

  // Step 2+3: Fetch details and download images for each product
  log('\n── Step 2: Fetching product details & images ──');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const label = `[${i + 1}/${allItems.length}]`;

    try {
      // Fetch from API
      await sleep(400);
      const apiData = await fetchJSON(`${API_BASE}/${item.articleNumber}`);
      const product = transformProduct(apiData, item.category, item.brand);
      const imageUrls = getImageUrls(apiData);

      const brandDir = path.join(ROOT, 'DuotoneFonts', 'downloads', item.brand);
      const productDir = path.join(brandDir, item.folder, product.name.replace(/[<>:"/\\|?*]/g, '_'));
      const jsonPath = path.join(productDir, 'product-import.json');

      if (DRY_RUN) {
        log(`${label} "${product.name}" → ${item.brand}/${item.category} | €${product.price} | ${imageUrls.length} imgs | ${product.variants.length} variants`);
        continue;
      }

      // Skip if already scraped
      if (fs.existsSync(jsonPath)) {
        skipped++;
        log(`${label} "${product.name}" — already exists, skipping`);
        continue;
      }

      // Create directory
      fs.mkdirSync(path.join(productDir, 'images'), { recursive: true });

      // Download images
      if (!NO_IMAGES && imageUrls.length > 0) {
        process.stdout.write(`${label} "${product.name}" — downloading ${imageUrls.length} images... `);
        let downloaded = 0;
        for (let j = 0; j < imageUrls.length; j++) {
          try {
            const filename = getImageFilename(imageUrls[j], j);
            await downloadFile(imageUrls[j], path.join(productDir, 'images', filename));
            downloaded++;
            await sleep(150);
          } catch (err) {
            // skip failed images silently
          }
        }
        console.log(`${downloaded} downloaded`);
      } else {
        log(`${label} "${product.name}" — saving JSON`);
      }

      // Write product-import.json
      fs.writeFileSync(jsonPath, JSON.stringify(product, null, 2), 'utf8');
      created++;
      ok(`${label} "${product.name}" saved`);

    } catch (err) {
      failed++;
      warn(`${label} article ${item.articleNumber}: ${err.message}`);
    }
  }

  // Summary
  log('\n── Summary ──');
  if (DRY_RUN) {
    log(`${allItems.length} products discovered (dry run — nothing saved)`);
  } else {
    log(`Created: ${created}`);
    log(`Skipped (existing): ${skipped}`);
    log(`Failed: ${failed}`);
  }
  log('=== DONE ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
