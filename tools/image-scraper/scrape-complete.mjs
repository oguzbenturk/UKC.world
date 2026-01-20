#!/usr/bin/env node
/**
 * scrape-complete.mjs
 * 
 * Complete product scraper with:
 * - Short description + Detailed description
 * - Proper category/subcategory mapping to database schema
 * - All color variants with images
 * - Size-specific pricing
 * 
 * Usage:
 *   node scrape-complete.mjs --out=products --headless=false
 *   node scrape-complete.mjs --test         # Test 1 item per category
 *   node scrape-complete.mjs --category=kites --test
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY MAPPING (matches productCategories.js in frontend)
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_MAPPING = {
  // Duotone Kites
  'duotone-kites': {
    category: 'kites',
    subcategoryRules: [
      // No specific subcategory for kites in our schema (only spare-parts)
      // But we can use brand-specific info
    ],
    defaultSubcategory: null
  },
  // Duotone Boards
  'duotone-boards-twintip': {
    category: 'boards',
    subcategoryRules: [
      { match: /sls/i, subcategory: 'twintip-sls' },
      { match: /d-lab/i, subcategory: 'twintip-sls' },
      { match: /concept\s*blue/i, subcategory: 'twintip-standard' }
    ],
    defaultSubcategory: 'twintip-standard'
  },
  'duotone-boards-surf': {
    category: 'boards',
    subcategoryRules: [
      { match: /sls/i, subcategory: 'surfboard-sls' },
      { match: /d-lab/i, subcategory: 'surfboard-sls' },
      { match: /hybrid/i, subcategory: 'surfboard-hybrid' }
    ],
    defaultSubcategory: 'surfboard-standard'
  },
  // Duotone Bars
  'duotone-bars': {
    category: 'bars',
    subcategoryRules: [
      { match: /trust/i, subcategory: 'trust-bar' },
      { match: /click/i, subcategory: 'click-bar' },
      { match: /quick\s*rel|kit|leash/i, subcategory: 'spare-parts' }
    ],
    defaultSubcategory: 'trust-bar'
  },
  // Duotone Bags
  'duotone-bags': {
    category: 'equipment',
    subcategoryRules: [],
    defaultSubcategory: 'bags'
  },
  // ION Wetsuits
  'ion-wetsuits-men': {
    category: 'wetsuits',
    subcategoryRules: [
      { match: /shorty|short/i, subcategory: 'men-shorty' },
      { match: /overknee|3\.5|2-2/i, subcategory: 'men-shorty' },
      { match: /5-4|5\/4|4-3|4\/3|hood/i, subcategory: 'men-fullsuit' }
    ],
    defaultSubcategory: 'men-long'
  },
  'ion-wetsuits-women': {
    category: 'wetsuits',
    subcategoryRules: [
      { match: /shorty|short/i, subcategory: 'women-shorty' },
      { match: /overknee|3\.5|2-2/i, subcategory: 'women-shorty' },
      { match: /5-4|5\/4|4-3|4\/3|hood/i, subcategory: 'women-fullsuit' }
    ],
    defaultSubcategory: 'women-long'
  },
  // ION Harnesses
  'ion-harnesses': {
    category: 'harnesses',
    subcategoryRules: [
      { match: /waist|apex|riot|radar/i, subcategory: 'waist' },
      { match: /seat/i, subcategory: 'seat' }
    ],
    defaultSubcategory: 'waist'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT SOURCES
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCT_SOURCES = {
  'duotone-kites': {
    name: 'Duotone Kites',
    listUrl: 'https://www.duotonesports.com/en/kites',
    productPattern: /\/products\/duotone-.*-\d+$/,
    brand: 'Duotone'
  },
  'duotone-boards-twintip': {
    name: 'Duotone Twintip Boards',
    listUrl: 'https://www.duotonesports.com/en/boards/twin-tips',
    productPattern: /\/products\/duotone-.*-\d+$/,
    brand: 'Duotone'
  },
  'duotone-boards-surf': {
    name: 'Duotone Surf Boards',
    listUrl: 'https://www.duotonesports.com/en/boards/surfboards',
    productPattern: /\/products\/duotone-.*-\d+$/,
    brand: 'Duotone'
  },
  'duotone-bars': {
    name: 'Duotone Bars',
    listUrl: 'https://www.duotonesports.com/en/bars',
    productPattern: /\/products\/duotone-.*-\d+$/,
    brand: 'Duotone'
  },
  'duotone-bags': {
    name: 'Duotone Bags',
    listUrl: 'https://www.duotonesports.com/en/accessories/bags',
    productPattern: /\/products\/duotone-.*-\d+$/,
    brand: 'Duotone'
  },
  'ion-wetsuits-men': {
    name: 'ION Wetsuits Men',
    listUrl: 'https://www.ion-products.com/en/wetsuits/men',
    productPattern: /\/products\/ion-.*-\d+$/,
    brand: 'ION'
  },
  'ion-wetsuits-women': {
    name: 'ION Wetsuits Women',
    listUrl: 'https://www.ion-products.com/en/wetsuits/women',
    productPattern: /\/products\/ion-.*-\d+$/,
    brand: 'ION'
  },
  'ion-harnesses': {
    name: 'ION Harnesses',
    listUrl: 'https://www.ion-products.com/en/harness',
    productPattern: /\/products\/ion-.*-\d+$/,
    brand: 'ION'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function slugify(str) {
  return str.toString().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function sanitizeFilename(str) {
  return str.replace(/[<>:"/\\|?*]/g, '-').trim().substring(0, 120);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parsePrice(priceText) {
  if (!priceText) return null;
  const priceMatch = priceText.match(/€?\s*([\d.,]+)/);
  if (!priceMatch) return null;
  
  let priceStr = priceMatch[1];
  // Handle European format (1.234,56) vs US format (1,234.56)
  if (priceStr.includes(',') && priceStr.includes('.')) {
    if (priceStr.lastIndexOf(',') > priceStr.lastIndexOf('.')) {
      priceStr = priceStr.replace(/\./g, '').replace(',', '.');
    } else {
      priceStr = priceStr.replace(/,/g, '');
    }
  } else if (priceStr.includes(',')) {
    // Could be 1,234 or 12,34
    const parts = priceStr.split(',');
    if (parts[1] && parts[1].length === 2) {
      priceStr = priceStr.replace(',', '.');
    } else {
      priceStr = priceStr.replace(/,/g, '');
    }
  }
  
  const price = parseFloat(priceStr);
  return isNaN(price) ? null : price;
}

async function downloadImage(page, url, outPath) {
  try {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const response = await page.request.get(url);
    if (!response.ok()) return { ok: false };
    const buffer = await response.body();
    await fs.writeFile(outPath, buffer);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function acceptCookies(page) {
  try {
    for (const selector of ['button:has-text("OK")', 'button:has-text("Accept")', '[class*="cookie"] button']) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  } catch (e) {}
}

// Determine subcategory based on product name and category mapping
function determineSubcategory(productName, sourceKey) {
  const mapping = CATEGORY_MAPPING[sourceKey];
  if (!mapping) return { category: 'other', subcategory: null };
  
  const nameLower = productName.toLowerCase();
  
  for (const rule of mapping.subcategoryRules) {
    if (rule.match.test(nameLower)) {
      return { category: mapping.category, subcategory: rule.subcategory };
    }
  }
  
  return { category: mapping.category, subcategory: mapping.defaultSubcategory };
}

// ═══════════════════════════════════════════════════════════════════════════
// DESCRIPTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

async function extractDescriptions(page, brand) {
  return await page.evaluate((brandName) => {
    let shortDesc = '';
    let detailedDesc = '';
    
    // Try to get short description (usually near the title or price)
    const shortSelectors = [
      '.product-subtitle',
      '.product-tagline',
      '.product-short-description',
      '[class*="subtitle"]',
      '[class*="tagline"]',
      '.lead',
      'meta[name="description"]'
    ];
    
    for (const selector of shortSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        shortDesc = el.tagName === 'META' ? el.getAttribute('content') : el.textContent.trim();
        if (shortDesc && shortDesc.length > 10) break;
      }
    }
    
    // Try to get detailed description
    const detailSelectors = [
      // Duotone specific
      '.product-description',
      '.product-details',
      '[class*="description"]',
      '[class*="product-info"]',
      // Generic
      '.accordion-content',
      '[data-tab="description"]',
      '.tab-content',
      // Main content areas
      'article',
      '.content-block'
    ];
    
    const collectedDetails = [];
    
    for (const selector of detailSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Skip if it's navigation, header, footer, or form
        if (el.closest('nav, header, footer, form, .cart, .checkout')) return;
        
        const text = el.textContent.trim();
        // Skip very short or very long (likely full page) content
        if (text.length > 50 && text.length < 5000 && !collectedDetails.includes(text)) {
          collectedDetails.push(text);
        }
      });
    }
    
    // Look for feature lists
    const featureLists = document.querySelectorAll('ul.features, .feature-list, [class*="feature"] ul, .specs ul');
    featureLists.forEach(ul => {
      const items = Array.from(ul.querySelectorAll('li')).map(li => '• ' + li.textContent.trim());
      if (items.length > 0) {
        collectedDetails.push('\n' + items.join('\n'));
      }
    });
    
    // Look for accordion/expandable sections (common on product pages)
    const accordions = document.querySelectorAll('.accordion, [class*="accordion"], .expandable, details');
    accordions.forEach(acc => {
      const title = acc.querySelector('summary, .accordion-header, [class*="title"], button')?.textContent.trim();
      const content = acc.querySelector('.accordion-content, .accordion-body, [class*="content"]')?.textContent.trim();
      if (title && content && content.length > 20) {
        collectedDetails.push(`\n**${title}**\n${content}`);
      }
    });
    
    // Combine all details
    detailedDesc = collectedDetails.join('\n\n').substring(0, 4000);
    
    // Clean up whitespace
    detailedDesc = detailedDesc.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
    shortDesc = shortDesc.replace(/\s+/g, ' ').trim();
    
    // If no short desc, extract first sentence from detailed
    if (!shortDesc && detailedDesc) {
      const firstSentence = detailedDesc.match(/^[^.!?]*[.!?]/);
      shortDesc = firstSentence ? firstSentence[0].substring(0, 200) : detailedDesc.substring(0, 200);
    }
    
    return { shortDesc, detailedDesc };
  }, brand);
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

async function getGalleryImages(page) {
  return await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    
    // Look for high-res gallery images
    document.querySelectorAll('img').forEach(img => {
      let src = img.src || img.dataset.src || img.dataset.lazy || '';
      if (!src || src.includes('data:')) return;
      
      // Skip small images, icons, logos
      const width = img.naturalWidth || parseInt(img.width) || 0;
      const height = img.naturalHeight || parseInt(img.height) || 0;
      if (width > 0 && width < 200) return;
      if (height > 0 && height < 200) return;
      
      // Skip common non-product images
      const srcLower = src.toLowerCase();
      if (srcLower.includes('logo') || srcLower.includes('icon') || 
          srcLower.includes('badge') || srcLower.includes('flag') ||
          srcLower.includes('payment') || srcLower.includes('shipping')) return;
      
      // Try to get highest resolution version
      src = src.replace(/w_\d+/, 'w_1200').replace(/h_\d+/, 'h_1200');
      src = src.replace(/\/\d+x\d+\//, '/1200x1200/');
      
      if (!seen.has(src)) {
        seen.add(src);
        imgs.push(src);
      }
    });
    
    return imgs.slice(0, 12); // Max 12 images
  });
}

async function loadAllGalleryImages(page) {
  // Click through thumbnails to load all images
  const thumbnails = await page.locator('.thumbnails-carousel__image, .product-thumbnails img, .gallery-thumb').all();
  
  for (const thumb of thumbnails) {
    try {
      if (await thumb.isVisible()) {
        await thumb.click();
        await page.waitForTimeout(300);
      }
    } catch (e) {}
  }
}

async function getColorVariants(page) {
  const colorVariants = await page.locator('.variant-slider-item, .color-swatch, [class*="color-variant"]').all();
  const colors = [];
  
  for (let c = 0; c < colorVariants.length; c++) {
    const colorItem = colorVariants[c];
    
    const isVisible = await colorItem.isVisible().catch(() => false);
    if (!isVisible) continue;
    
    // Try to get alt from img, then title from element, fallback to generic
    let colorAlt = await colorItem.locator('img').getAttribute('alt').catch(() => null);
    if (!colorAlt) {
      colorAlt = await colorItem.getAttribute('title').catch(() => null);
    }
    if (!colorAlt) {
      colorAlt = `Color ${c + 1}`;
    }
    
    // Extract color code and name
    const colorMatch = colorAlt.match(/C\d+:(.+)$/) || colorAlt.match(/-\s*(.+)$/);
    const colorName = colorMatch ? colorMatch[1].trim() : `Color ${c + 1}`;
    const colorCode = colorAlt.match(/C\d+/) ? colorAlt.match(/C\d+/)[0] : `C0${c + 1}`;
    
    colors.push({ element: colorItem, code: colorCode, name: colorName, alt: colorAlt });
  }
  
  return colors;
}

async function collectAllColorImages(page) {
  const colorVariants = await getColorVariants(page);
  const allImages = [];
  const colorData = [];
  const seenImages = new Set();
  
  // If no color variants, just get current images
  if (colorVariants.length === 0) {
    await loadAllGalleryImages(page);
    const images = await getGalleryImages(page);
    for (const url of images) {
      if (!seenImages.has(url)) {
        seenImages.add(url);
        allImages.push({ url, color: null });
      }
    }
    return { allImages, colorData: [] };
  }
  
  // Click each color and collect its images
  for (const color of colorVariants) {
    try {
      await color.element.click();
      await page.waitForTimeout(800);
      await loadAllGalleryImages(page);
      
      const images = await getGalleryImages(page);
      let addedCount = 0;
      
      for (const url of images) {
        if (!seenImages.has(url)) {
          seenImages.add(url);
          allImages.push({ url, color: color.code });
          addedCount++;
        }
      }
      
      colorData.push({
        code: color.code,
        name: color.name,
        imageCount: addedCount
      });
    } catch (err) {
      console.log(`    ⚠️ Color ${color.name}: ${err.message}`);
    }
  }
  
  return { allImages, colorData };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZE/VARIANT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

async function extractVariants(page) {
  const sizeButtons = page.locator('.button-select__button, .size-selector button, [class*="size"] button');
  const buttonCount = await sizeButtons.count();
  
  const variants = [];
  
  if (buttonCount === 0) {
    // Single price, no size variants
    const priceText = await page.locator('p.price, .price, [class*="price"]').first().textContent().catch(() => '');
    const price = parsePrice(priceText);
    
    if (price) {
      variants.push({
        label: 'One Size',
        size: 'One Size',
        price,
        price_final: Math.round(price * 1.10 * 100) / 100,
        cost_price: Math.round(price * 0.70 * 100) / 100
      });
    }
    return variants;
  }
  
  // Multiple size variants
  for (let i = 0; i < buttonCount; i++) {
    const btn = sizeButtons.nth(i);
    
    try {
      // Get size label
      const sizeLabel = await btn.textContent().catch(() => null);
      if (!sizeLabel) continue;
      
      // Click to see price for this size
      await btn.click();
      await page.waitForTimeout(300);
      
      // Get price
      const priceText = await page.locator('p.price, .price, [class*="price"]').first().textContent().catch(() => '');
      const price = parsePrice(priceText);
      
      if (!price) continue;
      
      // Parse size (for kites: extract sqm)
      const sizeTrimmed = sizeLabel.trim();
      const sqmMatch = sizeTrimmed.match(/^([\d.]+)$/);
      
      variants.push({
        label: sizeTrimmed,
        size: sizeTrimmed,
        size_sqm: sqmMatch ? parseFloat(sqmMatch[1]) : null,
        price,
        price_final: Math.round(price * 1.10 * 100) / 100,
        cost_price: Math.round(price * 0.77 * 100) / 100
      });
    } catch (err) {
      console.log(`    ⚠️ Size ${i}: ${err.message}`);
    }
  }
  
  return variants;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeProduct(page, productUrl, sourceKey, outDir) {
  const source = PRODUCT_SOURCES[sourceKey];
  console.log(`\n📦 Scraping: ${productUrl}`);
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await acceptCookies(page);
    await page.waitForTimeout(500);
    
    // Get product name
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown Product');
    const cleanName = name.trim();
    console.log(`  📋 ${cleanName}`);
    
    // Determine category and subcategory
    const { category, subcategory } = determineSubcategory(cleanName, sourceKey);
    console.log(`  📁 Category: ${category}, Subcategory: ${subcategory || 'none'}`);
    
    // Extract descriptions
    console.log(`  📝 Extracting descriptions...`);
    const { shortDesc, detailedDesc } = await extractDescriptions(page, source.brand);
    console.log(`  📝 Short: ${shortDesc.substring(0, 60)}...`);
    console.log(`  📝 Detailed: ${detailedDesc.length} chars`);
    
    // Collect images from all color variants
    console.log(`  🎨 Collecting images...`);
    const { allImages, colorData } = await collectAllColorImages(page);
    console.log(`  🎨 Found ${allImages.length} images, ${colorData.length || 1} colors`);
    
    // Extract variants (sizes/prices)
    console.log(`  💰 Extracting variants...`);
    const variants = await extractVariants(page);
    console.log(`  💰 Found ${variants.length} variants`);
    
    if (variants.length === 0) {
      console.log(`  ⚠️ No price found, skipping`);
      return null;
    }
    
    // Create output directory
    const productFolder = sanitizeFilename(cleanName);
    const productDir = path.join(outDir, source.brand, category, productFolder);
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    // Download images
    process.stdout.write(`  ⬇️ Downloading images: `);
    const downloadedImages = [];
    
    for (let i = 0; i < Math.min(allImages.length, 10); i++) {
      const { url, color } = allImages[i];
      const ext = path.extname(new URL(url).pathname) || '.png';
      const filename = color ? `${color}-${i + 1}${ext}` : `product-${i + 1}${ext}`;
      const filepath = path.join(imageDir, filename);
      
      const result = await downloadImage(page, url, filepath);
      if (result.ok) {
        downloadedImages.push(`images/${filename}`);
        process.stdout.write('.');
      } else {
        process.stdout.write('x');
      }
    }
    console.log(` ${downloadedImages.length} saved`);
    
    // Build product data
    const productData = {
      name: cleanName,
      sku: `${slugify(cleanName)}-${crypto.createHash('md5').update(cleanName).digest('hex').slice(0, 6).toUpperCase()}`,
      brand: source.brand,
      category,
      subcategory,
      description: shortDesc || `${source.brand} ${cleanName}`,
      description_detailed: detailedDesc || null,
      stock_quantity: randomInt(3, 12),
      currency: 'EUR',
      price: variants[0]?.price || 0,
      cost_price: variants[0]?.cost_price || 0,
      colors: colorData.length > 0 ? colorData : null,
      sizes: variants.length > 1 ? variants.map(v => v.label) : null,
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      variants,
      source_url: productUrl,
      scraped_at: new Date().toISOString()
    };
    
    // Save JSON
    await fs.writeFile(
      path.join(productDir, 'product-import.json'),
      JSON.stringify(productData, null, 2)
    );
    
    console.log(`  ✅ Saved: ${productDir}`);
    return productData;
    
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

async function discoverProducts(page, sourceKey) {
  const source = PRODUCT_SOURCES[sourceKey];
  console.log(`\n🔍 Discovering products: ${source.name}`);
  console.log(`   URL: ${source.listUrl}`);
  
  await page.goto(source.listUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await acceptCookies(page);
  
  // Scroll to load all products
  let lastHeight = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    
    // Try clicking "Load More" button
    try {
      const loadMore = page.locator('button:has-text("Load more"), button:has-text("Show more"), [class*="load-more"]').first();
      if (await loadMore.isVisible({ timeout: 500 })) {
        await loadMore.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {}
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
  }
  
  // Extract product URLs
  const urls = await page.evaluate((pattern) => {
    const links = Array.from(document.querySelectorAll('a[href*="/products/"]'));
    const regex = new RegExp(pattern);
    const urls = new Set();
    
    links.forEach(a => {
      const href = a.href;
      if (regex.test(href)) {
        urls.add(href);
      }
    });
    
    return Array.from(urls);
  }, source.productPattern.source);
  
  console.log(`   Found ${urls.length} products`);
  return urls;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function run() {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      opts[key] = val ?? true;
    }
  });
  
  const outDir = opts.out || 'products';
  const headless = opts.headless !== 'false';
  const testMode = opts.test === true || opts.test === 'true';
  const categoryFilter = opts.category || null;
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        COMPLETE PRODUCT SCRAPER v2.0                        ║
║        With Descriptions, Categories & Subcategories         ║
╚══════════════════════════════════════════════════════════════╝

  Output:     ${outDir}
  Headless:   ${headless}
  Test Mode:  ${testMode} ${testMode ? '(1 item per category)' : ''}
  Category:   ${categoryFilter || 'all'}
`);
  
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    categories: {}
  };
  
  try {
    // Determine which sources to scrape
    const sourcesToScrape = categoryFilter 
      ? Object.keys(PRODUCT_SOURCES).filter(k => k.includes(categoryFilter))
      : Object.keys(PRODUCT_SOURCES);
    
    console.log(`\n📋 Scraping ${sourcesToScrape.length} categories...`);
    
    for (const sourceKey of sourcesToScrape) {
      const source = PRODUCT_SOURCES[sourceKey];
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📂 ${source.name}`);
      console.log(`${'═'.repeat(60)}`);
      
      // Discover products
      const productUrls = await discoverProducts(page, sourceKey);
      
      if (productUrls.length === 0) {
        console.log(`   ⚠️ No products found, skipping`);
        continue;
      }
      
      // In test mode, only scrape 1 product per category
      const urlsToScrape = testMode ? [productUrls[0]] : productUrls;
      
      stats.categories[sourceKey] = { found: productUrls.length, scraped: 0 };
      
      for (const url of urlsToScrape) {
        stats.total++;
        const result = await scrapeProduct(page, url, sourceKey, outDir);
        
        if (result) {
          stats.success++;
          stats.categories[sourceKey].scraped++;
        } else {
          stats.failed++;
        }
        
        // Rate limiting
        await page.waitForTimeout(randomInt(1000, 2000));
      }
    }
    
    // Save summary
    const summary = {
      scraped_at: new Date().toISOString(),
      test_mode: testMode,
      stats,
      categories: Object.entries(stats.categories).map(([key, data]) => ({
        source: key,
        name: PRODUCT_SOURCES[key].name,
        ...data
      }))
    };
    
    await fs.writeFile(
      path.join(outDir, '_scrape-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log(`
${'═'.repeat(60)}
                    SCRAPING COMPLETE
${'═'.repeat(60)}
  Total Products:  ${stats.total}
  Successful:      ${stats.success}
  Failed:          ${stats.failed}
  Output:          ${outDir}/
${'═'.repeat(60)}
`);
    
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
