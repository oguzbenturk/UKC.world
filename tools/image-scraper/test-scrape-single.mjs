#!/usr/bin/env node
/**
 * test-scrape-single.mjs
 * 
 * Test scraping a single product to verify the scraper works
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

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
  if (priceStr.includes(',') && priceStr.includes('.')) {
    if (priceStr.lastIndexOf(',') > priceStr.lastIndexOf('.')) {
      priceStr = priceStr.replace(/\./g, '').replace(',', '.');
    } else {
      priceStr = priceStr.replace(/,/g, '');
    }
  } else if (priceStr.includes(',')) {
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
    // Wait a bit for cookie banner to appear
    await page.waitForTimeout(1000);
    
    // Try various cookie consent selectors
    const cookieSelectors = [
      'button:has-text("OK")',
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("Alle akzeptieren")',
      'button:has-text("I agree")',
      '[class*="cookie"] button',
      '[class*="consent"] button',
      '#onetrust-accept-btn-handler',
      '.cc-accept',
      '[data-testid="cookie-accept"]'
    ];
    
    for (const selector of cookieSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click();
          console.log(`  🍪 Accepted cookies via: ${selector}`);
          await page.waitForTimeout(1000);
          return true;
        }
      } catch (e) {}
    }
    
    // Try pressing Escape to dismiss overlays
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    return false;
  } catch (e) {
    console.log('  ⚠️ Cookie handling:', e.message);
    return false;
  }
}

async function extractDescriptions(page) {
  return await page.evaluate(() => {
    let shortDesc = '';
    let detailedDesc = '';
    
    // Try meta description first
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      shortDesc = metaDesc.getAttribute('content') || '';
    }
    
    // Look for product description text
    const descSelectors = [
      '.product-description',
      '[class*="description"]',
      '.product-info p',
      'article p',
      '.content p'
    ];
    
    const paragraphs = [];
    for (const selector of descSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 30 && text.length < 2000) {
          paragraphs.push(text);
        }
      });
    }
    
    // Look for feature lists
    const features = [];
    document.querySelectorAll('ul li').forEach(li => {
      const text = li.textContent.trim();
      if (text.length > 5 && text.length < 200 && !text.includes('Cookie')) {
        features.push('• ' + text);
      }
    });
    
    detailedDesc = [...paragraphs, ...features.slice(0, 20)].join('\n\n').substring(0, 4000);
    
    if (!shortDesc && paragraphs.length > 0) {
      shortDesc = paragraphs[0].substring(0, 200);
    }
    
    return { shortDesc, detailedDesc };
  });
}

async function getGalleryImages(page) {
  return await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    
    document.querySelectorAll('img').forEach(img => {
      let src = img.src || img.dataset.src || '';
      if (!src || src.includes('data:')) return;
      
      const width = img.naturalWidth || parseInt(img.width) || 0;
      const height = img.naturalHeight || parseInt(img.height) || 0;
      if (width > 0 && width < 200) return;
      if (height > 0 && height < 200) return;
      
      const srcLower = src.toLowerCase();
      if (srcLower.includes('logo') || srcLower.includes('icon') || 
          srcLower.includes('badge') || srcLower.includes('flag')) return;
      
      src = src.replace(/w_\d+/, 'w_1200').replace(/h_\d+/, 'h_1200');
      
      if (!seen.has(src)) {
        seen.add(src);
        imgs.push(src);
      }
    });
    
    return imgs.slice(0, 10);
  });
}

async function scrapeProduct(page, url, outDir) {
  console.log(`\n📦 Scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await acceptCookies(page);
    
    // Wait for page content to load
    await page.waitForTimeout(1500);
    
    // Check if we got a real product page or cookie page
    const h1Text = await page.locator('h1').first().textContent().catch(() => '');
    if (!h1Text || h1Text.toLowerCase().includes('cookie') || h1Text.toLowerCase().includes('privacy')) {
      console.log(`  ⚠️ Blocked by consent page, retrying...`);
      await acceptCookies(page);
      await page.waitForTimeout(2000);
      // Reload the page
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }
    
    // Get product name
    const name = await page.locator('h1').first().textContent().catch(() => 'Unknown');
    console.log(`  📋 Name: ${name.trim()}`);
    
    // Extract descriptions
    console.log(`  📝 Extracting descriptions...`);
    const { shortDesc, detailedDesc } = await extractDescriptions(page);
    console.log(`  📝 Short (${shortDesc.length} chars): ${shortDesc.substring(0, 80)}...`);
    console.log(`  📝 Detailed: ${detailedDesc.length} chars`);
    
    // Get images
    console.log(`  🎨 Getting images...`);
    const images = await getGalleryImages(page);
    console.log(`  🎨 Found ${images.length} images`);
    
    // Get price
    const priceText = await page.locator('.price, [class*="price"]').first().textContent().catch(() => '');
    const price = parsePrice(priceText);
    console.log(`  💰 Price: €${price || 'not found'}`);
    
    // Determine category from URL and product name
    let category = 'other';
    let subcategory = null;
    let brand = 'Unknown';
    
    const nameLower = name.toLowerCase();
    const urlLower = url.toLowerCase();
    
    if (url.includes('duotonesports')) {
      brand = 'Duotone';
      // Detect category from URL path or product name
      if (urlLower.includes('/kites') || nameLower.includes('kite') || 
          nameLower.includes('rebel') || nameLower.includes('evo') || 
          nameLower.includes('neo') || nameLower.includes('dice') ||
          nameLower.includes('mono') || nameLower.includes('juice')) {
        category = 'kites';
        subcategory = null; // Kites don't have subcategories in our schema
      } else if (urlLower.includes('/boards') || urlLower.includes('board') ||
                 nameLower.includes('jaime') || nameLower.includes('soleil') ||
                 nameLower.includes('select') || nameLower.includes('spike') ||
                 nameLower.includes('gonzales') || nameLower.includes('gambler')) {
        category = 'boards';
        if (nameLower.includes('sls') || nameLower.includes('d-lab')) {
          subcategory = 'twintip-sls';
        } else {
          subcategory = 'twintip-standard';
        }
      } else if (urlLower.includes('/bars') || nameLower.includes('bar') || nameLower.includes('trust')) {
        category = 'bars';
        if (nameLower.includes('trust')) subcategory = 'trust-bar';
        else if (nameLower.includes('click')) subcategory = 'click-bar';
        else subcategory = 'spare-parts';
      } else if (urlLower.includes('/bags') || nameLower.includes('bag') || 
                 nameLower.includes('boardbag') || nameLower.includes('team bag')) {
        category = 'equipment';
        subcategory = 'bags';
      }
    } else if (url.includes('ion-products')) {
      brand = 'ION';
      if (urlLower.includes('/wetsuits') || nameLower.includes('wetsuit')) {
        category = 'wetsuits';
        // Check for gender
        if (urlLower.includes('/men') || nameLower.includes(' men')) {
          if (nameLower.includes('shorty') || nameLower.includes('short')) {
            subcategory = 'men-shorty';
          } else {
            subcategory = 'men-fullsuit';
          }
        } else if (urlLower.includes('/women') || nameLower.includes(' women')) {
          if (nameLower.includes('shorty') || nameLower.includes('short')) {
            subcategory = 'women-shorty';
          } else {
            subcategory = 'women-fullsuit';
          }
        }
      } else if (urlLower.includes('/harness') || nameLower.includes('harness') ||
                 nameLower.includes('apex') || nameLower.includes('riot')) {
        category = 'harnesses';
        subcategory = 'waist';
      }
    }
    
    console.log(`  📁 Category: ${category}, Subcategory: ${subcategory}`);
    
    // Create output dir
    const cleanName = name.trim();
    const productFolder = sanitizeFilename(cleanName);
    const productDir = path.join(outDir, brand, category, productFolder);
    const imageDir = path.join(productDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    
    // Download images
    const downloadedImages = [];
    console.log(`  ⬇️ Downloading images...`);
    for (let i = 0; i < Math.min(images.length, 5); i++) {
      const imgUrl = images[i];
      const ext = '.png';
      const filename = `product-${i + 1}${ext}`;
      const filepath = path.join(imageDir, filename);
      
      const result = await downloadImage(page, imgUrl, filepath);
      if (result.ok) {
        downloadedImages.push(`images/${filename}`);
        console.log(`    ✅ ${filename}`);
      } else {
        console.log(`    ❌ ${filename}`);
      }
    }
    
    // Build product data
    const productData = {
      name: cleanName,
      sku: `${slugify(cleanName)}-${crypto.createHash('md5').update(cleanName).digest('hex').slice(0, 6).toUpperCase()}`,
      brand,
      category,
      subcategory,
      description: shortDesc || `${brand} ${cleanName}`,
      description_detailed: detailedDesc || null,
      stock_quantity: randomInt(3, 12),
      currency: 'EUR',
      price: price || 0,
      cost_price: price ? Math.round(price * 0.70 * 100) / 100 : 0,
      image_url: downloadedImages[0] || null,
      images: downloadedImages,
      source_url: url,
      scraped_at: new Date().toISOString()
    };
    
    // Save JSON
    await fs.writeFile(
      path.join(productDir, 'product-import.json'),
      JSON.stringify(productData, null, 2)
    );
    
    console.log(`\n  ✅ SAVED: ${productDir}/product-import.json`);
    return productData;
    
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return null;
  }
}

// TEST URLS - one from each category (verified working)
const TEST_URLS = [
  // Duotone Kite - Rebel SLS
  'https://www.duotonesports.com/en/products/duotone-rebel-sls-2026-44260-3010',
  // Duotone Twintip Board - Jaime SLS  
  'https://www.duotonesports.com/en/products/duotone-jaime-sls-2026-44260-3200',
  // Duotone Bar - Trust Bar
  'https://www.duotonesports.com/en/products/duotone-trust-bar-quad-control-2026-44260-3109',
  // Duotone Bag - Team Bag
  'https://www.duotonesports.com/en/products/duotone-team-bag-2025-44220-7003',
  // ION Wetsuit Men - Seek Core
  'https://www.ion-products.com/en/products/ion-seek-core-4-3-front-zip-wetsuit-men-2026-48262-4479'
];

async function run() {
  const args = process.argv.slice(2);
  const outDir = args.find(a => a.startsWith('--out='))?.split('=')[1] || 'products-test';
  const headless = !args.includes('--headless=false');
  const singleUrl = args.find(a => a.startsWith('--url='))?.split('=')[1];
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        SINGLE PRODUCT TEST SCRAPER                           ║
╚══════════════════════════════════════════════════════════════╝

  Output:    ${outDir}
  Headless:  ${headless}
  URL:       ${singleUrl || 'testing ' + TEST_URLS.length + ' products'}
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
  
  const urlsToScrape = singleUrl ? [singleUrl] : TEST_URLS;
  const results = [];
  
  try {
    for (const url of urlsToScrape) {
      const result = await scrapeProduct(page, url, outDir);
      if (result) results.push(result);
      await page.waitForTimeout(2000);
    }
    
    console.log(`
════════════════════════════════════════════════════════════
                    SCRAPING COMPLETE
════════════════════════════════════════════════════════════
  Products scraped: ${results.length}/${urlsToScrape.length}
  Output: ${outDir}/
`);
    
    // Save summary
    await fs.writeFile(
      path.join(outDir, '_test-summary.json'),
      JSON.stringify({ scraped: results.length, products: results.map(r => ({ name: r.name, category: r.category, price: r.price })) }, null, 2)
    );
    
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
