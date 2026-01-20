#!/usr/bin/env node
/**
 * scrape-all.mjs
 * 
 * Master scraper that runs all product categories:
 * - Duotone Kites (with size-specific pricing)
 * - ION Wetsuits (Men & Women)
 * - Duotone Bars
 * - Duotone Boards
 * 
 * Usage:
 *   node scrape-all.mjs --out=downloads --headless=true
 *   node scrape-all.mjs --category=kites --out=downloads
 */

import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import crypto from 'crypto';

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

async function hideVideoAndModals(page) {
  // Inject CSS to hide video players, error modals, and newsletter popups
  await page.addStyleTag({
    content: `
      video, .video-player, [class*="video"], [class*="player"],
      .modal, .overlay, [class*="modal"], [class*="overlay"],
      [class*="error"][class*="dialog"],
      [class*="newsletter"], [class*="popup"], [class*="subscribe"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `
  }).catch(() => {});
  
  // Try to click close buttons on popups
  try {
    const closeButtons = await page.locator('button[aria-label="Close"], button.close, .close-button, [class*="close"]').all();
    for (const btn of closeButtons) {
      try {
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click({ timeout: 500 });
        }
      } catch {}
    }
  } catch {}
  
  // Press Escape multiple times to dismiss any modal
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

function parsePrice(priceText) {
  if (!priceText) return null;
  const priceMatch = priceText.match(/€?\s*([\d.,]+)/);
  if (!priceMatch) return null;
  
  let priceStr = priceMatch[1];
  if (priceStr.includes(',') && priceStr.includes('.')) {
    if (priceStr.lastIndexOf(',') > priceStr.lastIndexOf('.')) {
      priceStr = priceStr.replace(/\./g, '').replace(',', '.');
    } else {
      priceStr = priceStr.replace(/,/g, '');
    }
  } else if (priceStr.includes(',')) {
    if (priceStr.match(/,\d{2}$/)) {
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
    return { ok: false };
  }
}

async function acceptCookies(page) {
  try {
    for (const selector of ['button:has-text("OK")', 'button:has-text("Accept")']) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForTimeout(1000);
        return;
      }
    }
  } catch (e) {}
}

// Extract product descriptions from page
async function extractDescriptions(page) {
  return await page.evaluate(() => {
    let shortDesc = '';
    let detailedDesc = '';
    
    // Try meta description first
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      shortDesc = metaDesc.getAttribute('content') || '';
    }
    
    // Look for product description text (skip navigation/header/footer)
    const descSelectors = [
      '.product-description',
      '.product-details',
      '.product-content',
      '[itemprop="description"]',
      '[class*="description"]:not(nav):not(header):not(footer)',
      '.product-info p',
      'article.product p',
      '.content p',
      'main p'
    ];
    
    const paragraphs = [];
    for (const selector of descSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        // Skip if inside navigation, header, footer
        if (el.closest('nav, header, footer, [role="navigation"]')) return;
        
        const text = el.textContent.trim();
        if (text.length > 30 && text.length < 2000) {
          paragraphs.push(text);
        }
      });
    }
    
    // Look for feature lists (but skip navigation menus)
    const features = [];
    // Target ION-specific accordion features first
    const accordionItems = document.querySelectorAll('.accordion__content ul li, [class*="feature"] ul li, [class*="spec"] ul li');
    if (accordionItems.length > 0) {
      accordionItems.forEach(li => {
        const text = li.textContent.trim();
        if (text.length > 10 && text.length < 200 && !text.includes('Cookie')) {
          features.push('• ' + text);
        }
      });
    } else {
      // Fallback to general list items
      document.querySelectorAll('ul li').forEach(li => {
        // Skip navigation, header, footer, menu items
        if (li.closest('nav, header, footer, [role="navigation"], .menu, .nav, [class*="menu"], [class*="navigation"]')) return;
        
        // Skip if parent is a link-heavy list (likely navigation)
        const parentUl = li.closest('ul');
        if (parentUl) {
          const totalLinks = parentUl.querySelectorAll('a').length;
          const totalItems = parentUl.querySelectorAll('li').length;
          if (totalLinks > totalItems * 0.7) return; // More than 70% links = likely navigation
        }
        
        const text = li.textContent.trim();
        // Skip menu-like items (short text without spaces)
        if (text.length > 10 && text.length < 200 && !text.includes('Cookie') && text.split(' ').length > 1) {
          features.push('• ' + text);
        }
      });
    }
    
    detailedDesc = [...paragraphs, ...features.slice(0, 20)].join('\n\n').substring(0, 4000);
    
    if (!shortDesc && paragraphs.length > 0) {
      shortDesc = paragraphs[0].substring(0, 200);
    }
    
    return { shortDesc, detailedDesc };
  });
}

// Removed closeVideoPlayer and closeOverlays - not needed since we don't scroll

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_MAPPING = {
  // Duotone Kites
  'duotone-kites': {
    category: 'kites',
    subcategoryRules: [],
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

function determineSubcategory(productName, sourceKey) {
  const mapping = CATEGORY_MAPPING[sourceKey];
  if (!mapping) return null;
  
  for (const rule of mapping.subcategoryRules) {
    if (rule.match.test(productName)) {
      return rule.subcategory;
    }
  }
  
  return mapping.defaultSubcategory;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Get product gallery images (main high-res images only)
async function getGalleryImages(page) {
  return await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    
    document.querySelectorAll('img').forEach(img => {
      let src = img.src || img.dataset.src;
      if (!src) return;
      if (src.includes('data:image')) return;
      
      // Must be from product gallery
      if (!src.includes('product_picture_gallery_pictures')) return;
      
      // Must be main display image (not thumbnail)
      if (!img.classList.contains('responsive-image--default')) return;
      
      // Must be reasonably large
      const naturalSize = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
      const displaySize = Math.max(img.width || 0, img.height || 0);
      if (naturalSize < 500 || displaySize < 300) return;
      
      if (!seen.has(src)) {
        seen.add(src);
        imgs.push(src);
      }
    });
    
    return imgs;
  });
}

// Get ION product gallery images (different structure than Duotone)
async function getIonGalleryImages(page) {
  return await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    
    document.querySelectorAll('img').forEach(img => {
      let src = img.src || img.dataset.src;
      if (!src) return;
      if (src.includes('data:image')) return;
      
      // Filter out small images, logos, badges
      const naturalSize = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
      const displaySize = Math.max(img.width || 0, img.height || 0);
      if (naturalSize < 500 || displaySize < 300) return;
      
      // Skip thumbnails and icons
      if (src.includes('_thumb') || src.includes('icon') || src.includes('logo')) return;
      
      // Must be product images (ION uses cdn.shopify.com)
      if (!src.includes('cdn.shopify.com') && !src.includes('ion-products.com')) return;
      
      if (!seen.has(src)) {
        seen.add(src);
        imgs.push(src);
      }
    });
    
    return imgs;
  });
}

// Click through all thumbnails to load all gallery images
async function loadAllGalleryImages(page) {
  const thumbnails = await page.locator('.thumbnails-carousel__image').all();
  
  for (const thumb of thumbnails) {
    try {
      // Skip video/3D thumbnails
      const imgAlt = await thumb.locator('img').getAttribute('alt').catch(() => '');
      if (imgAlt.includes('Video') || imgAlt.includes('3D')) continue;
      
      await thumb.click();
      await page.waitForTimeout(100);
    } catch (e) {}
  }
  
  await page.waitForTimeout(200);
}

// Get color variants from page (only visible ones)
async function getColorVariants(page) {
  const colorVariants = await page.locator('.variant-slider-item').all();
  const colors = [];
  
  for (let c = 0; c < colorVariants.length; c++) {
    const colorItem = colorVariants[c];
    
    // Skip if not visible
    const isVisible = await colorItem.isVisible().catch(() => false);
    if (!isVisible) continue;
    
    const colorAlt = await colorItem.locator('img').getAttribute('alt').catch(() => `Color ${c + 1}`);
    
    // Extract color code and name from alt like "Rebel SLS - C07:purple/green"
    const colorMatch = colorAlt.match(/C\d+:(.+)$/) || colorAlt.match(/-\s*(.+)$/);
    const colorName = colorMatch ? colorMatch[1].trim() : `Color ${c + 1}`;
    const colorCode = colorAlt.match(/C\d+/) ? colorAlt.match(/C\d+/)[0] : `C0${c + 1}`;
    
    colors.push({ element: colorItem, code: colorCode, name: colorName, alt: colorAlt });
  }
  
  return colors;
}

// Collect images for all color variants
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
        allImages.push({ url, color: 'default', colorName: 'Default' });
      }
    }
    return { allImages, colorData: [] };
  }
  
  // Click each color and collect its images (with timeout protection)
  for (const color of colorVariants) {
    try {
      await color.element.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      
      await loadAllGalleryImages(page);
      const colorImages = await getGalleryImages(page);
    
      let addedCount = 0;
      for (const url of colorImages) {
        if (!seenImages.has(url)) {
          seenImages.add(url);
          allImages.push({ url, color: color.code, colorName: color.name });
          addedCount++;
        }
      }
      
      colorData.push({
        code: color.code,
        name: color.name,
        imageCount: addedCount
      });
    } catch (err) {
      console.log(`    ⚠️  Skipping color ${color.name}: ${err.message}`);
    }
  }
  
  return { allImages, colorData };
}

// Collect images for ION wetsuits (different image structure)
async function collectAllColorImagesIon(page) {
  const colorVariants = await getColorVariants(page);
  const allImages = [];
  const colorData = [];
  const seenImages = new Set();
  const MAX_IMAGES_PER_COLOR = 4;
  
  // If no color variants, just get current images
  if (colorVariants.length === 0) {
    const images = await getIonGalleryImages(page);
    for (const url of images.slice(0, MAX_IMAGES_PER_COLOR)) {
      if (!seenImages.has(url)) {
        seenImages.add(url);
        allImages.push({ url, color: 'default', colorName: 'Default' });
      }
    }
    return { allImages, colorData: [] };
  }
  
  // Click each color and collect its images (with timeout protection)
  for (const color of colorVariants) {
    try {
      await color.element.click({ timeout: 5000 });
      await page.waitForTimeout(600);
      
      const colorImages = await getIonGalleryImages(page);
    
      let addedCount = 0;
      for (const url of colorImages.slice(0, MAX_IMAGES_PER_COLOR)) {
        if (!seenImages.has(url)) {
          seenImages.add(url);
          allImages.push({ url, color: color.code, colorName: color.name });
          addedCount++;
        }
      }
      
      colorData.push({
        code: color.code,
        name: color.name,
        imageCount: addedCount
      });
    } catch (err) {
      console.log(`    ⚠️  Skipping color ${color.name}: ${err.message}`);
    }
  }
  
  return { allImages, colorData };
}

async function getImages(page) {
  return await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    
    // Look specifically for product gallery images
    const gallerySelectors = [
      '.product-gallery img',
      '.product-images img',
      '.product-slider img',
      '[class*="gallery"] img',
      '[class*="slider"] img',
      '[data-zoom]',
      'img[src*="/products/"]'
    ];
    
    // First try gallery-specific selectors
    for (const selector of gallerySelectors) {
      document.querySelectorAll(selector).forEach(img => {
        let src = img.src || img.dataset.src || img.dataset.zoom;
        if (src && !seen.has(src)) {
          seen.add(src);
          imgs.push(src);
        }
      });
    }
    
    // If no gallery images found, fall back to general but with strict filtering
    if (imgs.length === 0) {
      document.querySelectorAll('img').forEach(img => {
        let src = img.src || img.dataset.src;
        if (!src) return;
        
        // Skip data URLs
        if (src.includes('data:image')) return;
        
        // Skip common non-product images
        const skipPatterns = [
          'icon', 'logo', 'flag', 'badge', 'sprite',
          'payment', 'social', 'footer', 'header', 'menu',
          'banner', 'svg', '/icons/', '/logos/', '/badges/',
          'sls_badge', 'dllab_badge', 'concept_blue',
          '_badge', '-badge', 'label', 'tag'
        ];
        
        const srcLower = src.toLowerCase();
        if (skipPatterns.some(p => srcLower.includes(p))) return;
        
        // Skip very small images (likely icons/logos)
        if (img.naturalWidth && img.naturalWidth < 200) return;
        if (img.naturalHeight && img.naturalHeight < 200) return;
        if (img.width < 150 || img.height < 150) return;
        
        // Skip images that are likely badges/labels based on aspect ratio
        if (img.naturalWidth && img.naturalHeight) {
          const ratio = img.naturalWidth / img.naturalHeight;
          // Very wide or very tall images are likely banners/badges
          if (ratio > 3 || ratio < 0.3) return;
        }
        
        if (!seen.has(src)) {
          seen.add(src);
          imgs.push(src);
        }
      });
    }
    
    return imgs.slice(0, 10);
  });
}

async function downloadImages(page, urls, imageDir, maxImages = 8) {
  const downloaded = [];
  for (let i = 0; i < Math.min(urls.length, maxImages); i++) {
    try {
      const url = urls[i];
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const filename = `img-${i + 1}${ext}`;
      const dest = path.join(imageDir, filename);
      
      const result = await downloadImage(page, url, dest);
      if (result.ok) {
        downloaded.push(`images/${filename}`);
        process.stdout.write('.');
      } else {
        process.stdout.write('x');
      }
    } catch (e) {
      process.stdout.write('x');
    }
  }
  return downloaded;
}

// ═══════════════════════════════════════════════════════════════════════════
// DUOTONE KITES
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeKite(page, productUrl, outDir) {
  console.log(`\n🪁 ${productUrl}`);
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await acceptCookies(page);
    await page.waitForTimeout(300);
    
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown');
    console.log(`  📦 ${name.trim()}`);
    
    // Extract descriptions
    const { shortDesc, detailedDesc } = await extractDescriptions(page);
    if (shortDesc) {
      console.log(`  📝 Description: ${shortDesc.substring(0, 50)}...`);
    }
    
    // Determine subcategory from product name
    const nameLower = name.toLowerCase();
    let subcategory = 'Other';
    if (nameLower.includes('sls')) subcategory = 'SLS';
    else if (nameLower.includes('d/lab') || nameLower.includes('dlab')) subcategory = 'D-LAB';
    else if (nameLower.includes('evo')) subcategory = 'EVO';
    else if (nameLower.includes('rebel')) subcategory = 'Rebel';
    else if (nameLower.includes('dice')) subcategory = 'Dice';
    else if (nameLower.includes('vegas')) subcategory = 'Vegas';
    else if (nameLower.includes('neo')) subcategory = 'Neo';
    
    // Check if already exists
    const productFolder = sanitizeFilename(name.trim());
    const productDir = path.join(outDir, 'Duotone', 'Kites', subcategory, productFolder);
    const productFile = path.join(productDir, 'product-import.json');
    
    try {
      await fs.access(productFile);
      console.log(`  ⏭️  Already exists, skipping`);
      return null;
    } catch {
      // File doesn't exist, continue scraping
    }
    
    // Collect images from ALL color variants
    const { allImages, colorData } = await collectAllColorImages(page);
    console.log(`  🎨 ${colorData.length || 1} colors, ${allImages.length} images`);
    
    // Get size buttons
    const sizeButtons = page.locator('.button-select__button');
    const buttonCount = await sizeButtons.count();
    
    if (buttonCount === 0) {
      console.log(`  ⚠️ No size buttons found`);
      return null;
    }
    
    // Extract variants (prices are same across colors, just different per size)
    const variants = [];
    for (let i = 0; i < buttonCount; i++) {
      const button = sizeButtons.nth(i);
      const sizeLabel = await button.textContent();
      
      await button.click();
      await page.waitForTimeout(800);
      
      const priceText = await page.locator('p.price.text-body-large').first().textContent().catch(() => '');
      const price = parsePrice(priceText);
      
      if (price) {
        const sizeMatch = sizeLabel.match(/([\d.]+)/);
        variants.push({
          label: sizeLabel.trim(),
          size_sqm: sizeMatch ? parseFloat(sizeMatch[1]) : null,
          price,
          price_final: Math.round(price * 1.10 * 100) / 100,
          cost_price: Math.round(price * 0.77 * 100) / 100
        });
        console.log(`    ✓ ${sizeLabel.trim().padEnd(6)} €${price}`);
      }
    }
    
    if (variants.length === 0) return null;
    
    // Save (reuse productFolder and productDir from skip check above)
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    // Download all color images
    process.stdout.write(`  ⬇️ `);
    const downloadedImages = [];
    for (let i = 0; i < allImages.length; i++) {
      const { url: imgUrl, color } = allImages[i];
      try {
        const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
        const filename = `${color}-${i + 1}${ext}`;
        const dest = path.join(imageDir, filename);
        
        const result = await downloadImage(page, imgUrl, dest);
        if (result.ok) {
          downloadedImages.push(`images/${filename}`);
          process.stdout.write('.');
        } else {
          process.stdout.write('x');
        }
      } catch (e) {
        process.stdout.write('x');
      }
    }
    console.log(` ${downloadedImages.length}`);
    
    const productData = {
      name: name.trim(),
      sku: `${slugify(name.trim())}-${crypto.createHash('md5').update(name).digest('hex').slice(0, 6).toUpperCase()}`,
      brand: 'DUOTONE',
      category: 'kites',
      subcategory: null,
      description: shortDesc || `${name.trim()} kite by DUOTONE`,
      description_detailed: detailedDesc || null,
      stock_quantity: randomInt(3, 8),
      currency: 'EUR',
      colors: colorData.length > 0 ? colorData : undefined,
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      source_url: productUrl,
      variants,
      scraped_at: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(productDir, 'product-import.json'), JSON.stringify(productData, null, 2));
    console.log(`  ✅ ${variants.length} sizes, ${colorData.length || 1} colors`);
    
    return productData;
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ION WETSUITS
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeWetsuit(page, productUrl, outDir) {
  console.log(`\n🏄 ${productUrl}`);
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await acceptCookies(page);
    await page.waitForTimeout(300);
    
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown');
    console.log(`  📦 ${name.trim()}`);
    
    // Extract descriptions
    const { shortDesc, detailedDesc } = await extractDescriptions(page);
    console.log(`  📝 Description: ${shortDesc ? shortDesc.substring(0, 50) + '...' : 'none'}`);
    
    // Gender detection
    const nameLower = name.toLowerCase();
    let gender = 'Unisex';
    if (productUrl.includes('/women/') || nameLower.includes('women')) gender = 'Women';
    else if (productUrl.includes('/men/') || nameLower.includes(' men')) gender = 'Men';
    
    // Determine proper subcategory based on category mapping
    const sourceKey = gender === 'Men' ? 'ion-wetsuits-men' : 'ion-wetsuits-women';
    const properSubcategory = determineSubcategory(name, sourceKey);
    
    // Check if already exists
    const productFolder = sanitizeFilename(name.trim());
    const productDir = path.join(outDir, 'ION', 'Wetsuits', gender, properSubcategory || 'Other', productFolder);
    const productFile = path.join(productDir, 'product-import.json');
    
    try {
      await fs.access(productFile);
      console.log(`  ⏭️  Already exists, skipping`);
      return null;
    } catch {
      // File doesn't exist, continue scraping
    }
    
    // Collect images from ALL color variants (ION-specific)
    const { allImages, colorData } = await collectAllColorImagesIon(page);
    console.log(`  🎨 ${colorData.length || 1} colors, ${allImages.length} images`);
    
    // Get single price (wetsuits don't have size-specific pricing)
    const priceText = await page.locator('p.price.text-body-large, .price').first().textContent().catch(() => '');
    const price = parsePrice(priceText);
    
    if (!price) {
      console.log(`  ⚠️  No price found`);
      return null;
    }
    
    console.log(`  💰 €${price}`);
    
    // Get available sizes (just for info, not for pricing)
    const sizeButtons = page.locator('.button-select__button');
    const buttonCount = await sizeButtons.count();
    const sizes = [];
    
    if (buttonCount > 0) {
      for (let i = 0; i < buttonCount; i++) {
        const button = sizeButtons.nth(i);
        const sizeLabel = await button.textContent();
        sizes.push(sizeLabel.trim());
      }
      console.log(`  📏 ${sizes.length} sizes: ${sizes.join(', ')}`);
    }
    
    // Create separate variant per size (same price for all sizes)
    const variants = sizes.length > 0 
      ? sizes.map(size => ({
          label: size,
          size: size,
          price,
          price_final: Math.round(price * 1.10 * 100) / 100,
          cost_price: Math.round(price * 0.70 * 100) / 100
        }))
      : [{
          label: 'One Size',
          size: 'One Size',
          price,
          price_final: Math.round(price * 1.10 * 100) / 100,
          cost_price: Math.round(price * 0.70 * 100) / 100
        }];
    
    // Save (reuse productFolder and productDir from skip check above)
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    // Download all color images
    process.stdout.write(`  ⬇️ `);
    const downloadedImages = [];
    for (let i = 0; i < allImages.length; i++) {
      const { url: imgUrl, color } = allImages[i];
      try {
        const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
        const filename = `${color}-${i + 1}${ext}`;
        const dest = path.join(imageDir, filename);
        
        const result = await downloadImage(page, imgUrl, dest);
        if (result.ok) {
          downloadedImages.push(`images/${filename}`);
          process.stdout.write('.');
        } else {
          process.stdout.write('x');
        }
      } catch (e) {
        process.stdout.write('x');
      }
    }
    console.log(` ${downloadedImages.length}`);
    
    const productData = {
      name: name.trim(),
      sku: `${slugify(name.trim())}-${crypto.createHash('md5').update(name).digest('hex').slice(0, 6).toUpperCase()}`,
      brand: 'ION',
      category: 'wetsuits',
      subcategory: properSubcategory,
      description: shortDesc || `${name.trim()} wetsuit by ION`,
      description_detailed: detailedDesc || null,
      gender,
      stock_quantity: randomInt(3, 10),
      currency: 'EUR',
      colors: colorData.length > 0 ? colorData : undefined,
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      source_url: productUrl,
      variants,
      scraped_at: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(productDir, 'product-import.json'), JSON.stringify(productData, null, 2));
    console.log(`  ✅ ${variants.length} sizes, ${colorData.length || 1} colors`);
    
    return productData;
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DUOTONE BOARDS (Simplified - 1 image, no colors, list sizes)
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeBoard(page, productUrl, outDir) {
  console.log(`\n🛹 ${productUrl}`);
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await acceptCookies(page);
    await page.waitForTimeout(500);
    
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown');
    console.log(`  📦 ${name.trim()}`);
    
    // Extract descriptions
    const { shortDesc, detailedDesc } = await extractDescriptions(page);
    console.log(`  📝 Description: ${shortDesc ? shortDesc.substring(0, 50) + '...' : 'none'}`);
    
    // Determine subcategory
    const nameLower = name.toLowerCase();
    let subcategory = 'Other';
    const subcategories = {
      'gambler': 'Gambler', 'jaime': 'Jaime', 'spike': 'Spike', 
      'soleil': 'Soleil', 'gonzales': 'Gonzales', 'select': 'Select',
      'pro': 'Pro', 'whip': 'Whip', 'ts': 'TS'
    };
    for (const [key, val] of Object.entries(subcategories)) {
      if (nameLower.includes(key)) { subcategory = val; break; }
    }
    
    // Check if already exists
    const productFolder = sanitizeFilename(name.trim());
    const productDir = path.join(outDir, 'Duotone', 'Boards', subcategory, productFolder);
    const productFile = path.join(productDir, 'product-import.json');
    
    try {
      await fs.access(productFile);
      console.log(`  ⏭️  Already exists, skipping`);
      return null;
    } catch {
      // File doesn't exist, continue scraping
    }
    
    // Boards have only 1 image - collect it
    const images = await getGalleryImages(page);
    console.log(`  🖼️  ${images.length} image${images.length !== 1 ? 's' : ''}`);
    
    // Get single price (same for all sizes)
    const priceText = await page.locator('p.price.text-body-large').first().textContent().catch(() => '');
    const price = parsePrice(priceText);
    
    if (!price) {
      console.log(`  ⚠️  No price found`);
      return null;
    }
    
    // Get all available sizes (each size = different color variant for boards)
    const sizeButtons = await page.locator('.button-select__button').all();
    const sizes = [];
    
    for (const button of sizeButtons) {
      const sizeText = await button.textContent().catch(() => '');
      if (sizeText) sizes.push(sizeText.trim());
    }
    
    console.log(`  📏 ${sizes.length} size${sizes.length !== 1 ? 's' : ''}: ${sizes.join(', ')}`);
    console.log(`  💰 €${price} (same for all sizes)`);
    
    // Create variants (one per size, same price)
    const variants = sizes.map(size => ({
      label: size,
      price,
      price_final: Math.round(price * 1.10 * 100) / 100,
      cost_price: Math.round(price * 0.75 * 100) / 100
    }));
    
    if (variants.length === 0) {
      console.log(`  ⚠️  No sizes found`);
      return null;
    }
    
    // Save images
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    process.stdout.write(`  ⬇️ `);
    const downloadedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      try {
        const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
        const filename = `board-${i + 1}${ext}`;
        const dest = path.join(imageDir, filename);
        
        const result = await downloadImage(page, imgUrl, dest);
        if (result.ok) {
          downloadedImages.push(`images/${filename}`);
          process.stdout.write('.');
        } else {
          process.stdout.write('x');
        }
      } catch (e) {
        process.stdout.write('x');
      }
    }
    console.log(` ${downloadedImages.length}`);
    
    // Determine proper category/subcategory for boards
    let boardCategory = 'boards';
    let properSubcategory = null;
    if (productUrl.includes('/surf-kiteboards/') || nameLower.includes('surf')) {
      properSubcategory = determineSubcategory(name, 'duotone-boards-surf');
    } else {
      properSubcategory = determineSubcategory(name, 'duotone-boards-twintip');
    }
    
    const productData = {
      name: name.trim(),
      sku: `${slugify(name.trim())}-${crypto.createHash('md5').update(name).digest('hex').slice(0, 6).toUpperCase()}`,
      brand: 'DUOTONE',
      category: boardCategory,
      subcategory: properSubcategory,
      description: shortDesc || `${name.trim()} board by DUOTONE`,
      description_detailed: detailedDesc || null,
      stock_quantity: randomInt(2, 8),
      currency: 'EUR',
      sizes: sizes, // Store sizes as "color variants" since each size = different color
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      source_url: productUrl,
      variants,
      scraped_at: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(productDir, 'product-import.json'), JSON.stringify(productData, null, 2));
    console.log(`  ✅ ${variants.length} size${variants.length !== 1 ? 's' : ''}`);
    
    return productData;
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DUOTONE BARS/BOARDS
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeGear(page, productUrl, category, outDir) {
  console.log(`\n🛹 ${productUrl}`);
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await acceptCookies(page);
    await page.waitForTimeout(300);
    
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown');
    console.log(`  📦 ${name.trim()}`);
    
    // Extract descriptions
    const { shortDesc, detailedDesc } = await extractDescriptions(page);
    console.log(`  📝 Description: ${shortDesc ? shortDesc.substring(0, 50) + '...' : 'none'}`);
    
    // Determine subcategory from product name
    const nameLower = name.toLowerCase();
    let subcategory = 'Other';
    if (category === 'Bars') {
      if (nameLower.includes('trust')) subcategory = 'Trust';
      else if (nameLower.includes('navigator')) subcategory = 'Navigator';
      else if (nameLower.includes('quad')) subcategory = 'Quad';
    } else if (category === 'Boards-Twintips' || category === 'Boards-Surfboards') {
      if (nameLower.includes('gambler')) subcategory = 'Gambler';
      else if (nameLower.includes('jaime')) subcategory = 'Jaime';
      else if (nameLower.includes('spike')) subcategory = 'Spike';
      else if (nameLower.includes('soleil')) subcategory = 'Soleil';
      else if (nameLower.includes('gonzales')) subcategory = 'Gonzales';
      else if (nameLower.includes('select')) subcategory = 'Select';
      else if (nameLower.includes('pro')) subcategory = 'Pro';
      else if (nameLower.includes('whip')) subcategory = 'Whip';
    }
    
    // Check if already exists
    const productFolder = sanitizeFilename(name.trim());
    const productDir = path.join(outDir, 'Duotone', category, subcategory, productFolder);
    const productFile = path.join(productDir, 'product-import.json');
    
    try {
      await fs.access(productFile);
      console.log(`  ⏭️  Already exists, skipping`);
      return null;
    } catch {
      // File doesn't exist, continue scraping
    }
    
    // Collect images from ALL color variants
    const { allImages, colorData } = await collectAllColorImages(page);
    console.log(`  🎨 ${colorData.length || 1} colors, ${allImages.length} images`);
    
    // Get variants if any
    const sizeButtons = page.locator('.button-select__button');
    const buttonCount = await sizeButtons.count();
    
    const variants = [];
    
    if (buttonCount > 0) {
      for (let i = 0; i < buttonCount; i++) {
        const button = sizeButtons.nth(i);
        const label = await button.textContent();
        
        await button.click();
        await page.waitForTimeout(800);
        
        const priceText = await page.locator('p.price.text-body-large').first().textContent().catch(() => '');
        const price = parsePrice(priceText);
        
        if (price) {
          variants.push({
            label: label.trim(),
            price,
            price_final: Math.round(price * 1.10 * 100) / 100,
            cost_price: Math.round(price * 0.75 * 100) / 100
          });
          console.log(`    ✓ ${label.trim().padEnd(10)} €${price}`);
        }
      }
    } else {
      const priceText = await page.locator('p.price.text-body-large, .price').first().textContent().catch(() => '');
      const price = parsePrice(priceText);
      if (price) {
        variants.push({ label: 'Standard', price, price_final: price * 1.10, cost_price: price * 0.75 });
        console.log(`    ✓ Standard €${price}`);
      }
    }
    
    if (variants.length === 0) return null;
    
    // Save (reuse productFolder and productDir from skip check above)
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    // Download all color images
    process.stdout.write(`  ⬇️ `);
    const downloadedImages = [];
    for (let i = 0; i < allImages.length; i++) {
      const { url: imgUrl, color } = allImages[i];
      try {
        const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
        const filename = `${color}-${i + 1}${ext}`;
        const dest = path.join(imageDir, filename);
        
        const result = await downloadImage(page, imgUrl, dest);
        if (result.ok) {
          downloadedImages.push(`images/${filename}`);
          process.stdout.write('.');
        } else {
          process.stdout.write('x');
        }
      } catch (e) {
        process.stdout.write('x');
      }
    }
    console.log(` ${downloadedImages.length}`);
    
    // Determine proper category/subcategory
    let properCategory = 'equipment';
    let properSubcategory = null;
    
    if (category === 'Bars') {
      properCategory = 'bars';
      properSubcategory = determineSubcategory(name, 'duotone-bars');
    } else if (category === 'Bags') {
      properCategory = 'equipment';
      properSubcategory = 'bags';
    }
    
    const productData = {
      name: name.trim(),
      sku: `${slugify(name.trim())}-${crypto.createHash('md5').update(name).digest('hex').slice(0, 6).toUpperCase()}`,
      brand: 'DUOTONE',
      category: properCategory,
      subcategory: properSubcategory,
      description: shortDesc || `${name.trim()} by DUOTONE`,
      description_detailed: detailedDesc || null,
      stock_quantity: randomInt(3, 10),
      currency: 'EUR',
      colors: colorData.length > 0 ? colorData : undefined,
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      source_url: productUrl,
      variants,
      scraped_at: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(productDir, 'product-import.json'), JSON.stringify(productData, null, 2));
    console.log(`  ✅ ${variants.length} variants, ${colorData.length || 1} colors`);
    
    return productData;
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

async function discoverProducts(page, categoryUrl, productPattern) {
  console.log(`\n🔍 Discovering: ${categoryUrl}`);
  
  await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await acceptCookies(page);
  
  // Click "Load More" buttons until all products are loaded
  let loadedMore = true;
  let attempts = 0;
  while (loadedMore && attempts < 10) {
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    
    // Try to find and click "Load More" button
    try {
      const loadMoreButton = page.locator('button:has-text("Load More"), button:has-text("load more"), button:has-text("Show more"), [class*="load-more"]').first();
      if (await loadMoreButton.isVisible({ timeout: 2000 })) {
        console.log(`  Clicking "Load More"...`);
        await loadMoreButton.click();
        await page.waitForTimeout(2000);
        attempts++;
      } else {
        loadedMore = false;
      }
    } catch (e) {
      loadedMore = false;
    }
  }
  
  // Final scroll to ensure everything is loaded
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }
  
  const urls = await page.evaluate((pattern) => {
    const found = new Set();
    document.querySelectorAll('a[href*="/products/"]').forEach(a => {
      if (a.href.includes(pattern) && !a.href.includes('#')) {
        found.add(a.href.split('?')[0]);
      }
    });
    return Array.from(found);
  }, productPattern);
  
  console.log(`  Found ${urls.length} products`);
  return urls;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function run() {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach(arg => {
    const [k, v] = arg.split('=');
    if (k.startsWith('--')) opts[k.replace(/^--/, '')] = v || true;
  });
  
  const outDir = opts.out || 'downloads-complete';
  const headless = opts.headless !== 'false';
  const category = opts.category || 'all'; // kites, wetsuits, bars, boards, all
  const testMode = opts.test === true; // Test mode: 1 product per category
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         COMPLETE PRODUCT SCRAPER - Duotone & ION             ║
║         Size-Specific Pricing with Playwright                ║
╚══════════════════════════════════════════════════════════════╝

  Output:    ${outDir}
  Category:  ${category}
  Headless:  ${headless}
  Test Mode: ${testMode ? 'YES (1 per category)' : 'NO (all products)'}
`);
  
  const browser = await chromium.launch({ 
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const globalStats = { total: 0, success: 0, variants: 0 };
  
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // DUOTONE KITES
    // ─────────────────────────────────────────────────────────────────────────
    if (category === 'all' || category === 'kites') {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🪁 DUOTONE KITES`);
      console.log(`${'═'.repeat(60)}`);
      
      const kiteUrls = await discoverProducts(page, 'https://www.duotonesports.com/en/kiteboarding/kites', '/products/duotone-');
      globalStats.total += kiteUrls.length;
      
      const kiteLimit = testMode ? 1 : kiteUrls.length;
      for (let i = 0; i < kiteLimit; i++) {
        console.log(`\n[Kite ${i + 1}/${kiteLimit}]`);
        const result = await scrapeKite(page, kiteUrls[i], outDir);
        if (result) {
          globalStats.success++;
          globalStats.variants += result.variants.length;
        }
        await page.waitForTimeout(1500);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // ION WETSUITS - MEN
    // ─────────────────────────────────────────────────────────────────────────
    if (category === 'all' || category === 'wetsuits') {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🏄 ION WETSUITS - MEN`);
      console.log(`${'═'.repeat(60)}`);
      
      const menUrls = await discoverProducts(page, 'https://www.ion-products.com/en/water/men/wetsuits', '/products/ion-');
      globalStats.total += menUrls.length;
      
      const menLimit = testMode ? 1 : menUrls.length;
      for (let i = 0; i < menLimit; i++) {
        console.log(`\n[Men ${i + 1}/${menLimit}]`);
        const result = await scrapeWetsuit(page, menUrls[i], outDir);
        if (result) {
          globalStats.success++;
          globalStats.variants += result.variants.length;
        }
        await page.waitForTimeout(1500);
      }
      
      // ION WETSUITS - WOMEN
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🏄 ION WETSUITS - WOMEN`);
      console.log(`${'═'.repeat(60)}`);
      
      const womenUrls = await discoverProducts(page, 'https://www.ion-products.com/en/water/women/wetsuits', '/products/ion-');
      globalStats.total += womenUrls.length;
      
      const womenLimit = testMode ? 1 : womenUrls.length;
      for (let i = 0; i < womenLimit; i++) {
        console.log(`\n[Women ${i + 1}/${womenLimit}]`);
        const result = await scrapeWetsuit(page, womenUrls[i], outDir);
        if (result) {
          globalStats.success++;
          globalStats.variants += result.variants.length;
        }
        await page.waitForTimeout(1500);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // DUOTONE BARS
    // ─────────────────────────────────────────────────────────────────────────
    if (category === 'all' || category === 'bars') {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🎮 DUOTONE BARS`);
      console.log(`${'═'.repeat(60)}`);
      
      const barUrls = await discoverProducts(page, 'https://www.duotonesports.com/en/kiteboarding/bars', '/products/');
      globalStats.total += barUrls.length;
      
      const barLimit = testMode ? 1 : barUrls.length;
      for (let i = 0; i < barLimit; i++) {
        console.log(`\n[Bar ${i + 1}/${barLimit}]`);
        const result = await scrapeGear(page, barUrls[i], 'Bars', outDir);
        if (result) {
          globalStats.success++;
          globalStats.variants += result.variants.length;
        }
        await page.waitForTimeout(1500);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // DUOTONE BOARDS
    // ─────────────────────────────────────────────────────────────────────────
    if (category === 'all' || category === 'boards') {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🛹 DUOTONE BOARDS`);
      console.log(`${'═'.repeat(60)}`);
      
      // Twintips
      console.log(`\n  📂 Twintips...`);
      const twintipUrls = await discoverProducts(page, 'https://www.duotonesports.com/en/kiteboarding/boards/twintips', '/products/');
      
      // Surfboards
      console.log(`\n  📂 Surfboards...`);
      const surfUrls = await discoverProducts(page, 'https://www.duotonesports.com/en/kiteboarding/boards/surfboards', '/products/');
      
      const boardUrls = [...new Set([...twintipUrls, ...surfUrls])];
      globalStats.total += boardUrls.length;
      
      const boardLimit = testMode ? 1 : boardUrls.length;
      for (let i = 0; i < boardLimit; i++) {
        console.log(`\n[Board ${i + 1}/${boardLimit}]`);
        const result = await scrapeBoard(page, boardUrls[i], outDir); // Changed from scrapeGear to scrapeBoard
        if (result) {
          globalStats.success++;
          globalStats.variants += result.variants.length;
        }
        await page.waitForTimeout(1500);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`

╔══════════════════════════════════════════════════════════════╗
║                    SCRAPING COMPLETE                         ║
╚══════════════════════════════════════════════════════════════╝

  📊 Statistics:
     Products scraped:  ${globalStats.success} / ${globalStats.total}
     Total variants:    ${globalStats.variants}
     Success rate:      ${Math.round(globalStats.success / globalStats.total * 100)}%

  📁 Output saved to: ${outDir}/
     ├── Duotone/
     │   ├── Kites/
     │   ├── Bars/
     │   └── Boards/
     └── ION/
         └── Wetsuits/
             ├── Men/
             └── Women/

`);
    
    // Save summary
    const summary = {
      scraped_at: new Date().toISOString(),
      stats: globalStats,
      output_dir: outDir
    };
    await fs.writeFile(path.join(outDir, '_scrape-summary.json'), JSON.stringify(summary, null, 2));
    
  } catch (err) {
    console.error('\n❌ Fatal error:', err);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
