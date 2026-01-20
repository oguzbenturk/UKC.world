#!/usr/bin/env node
/*
Scrape Duotone product variant prices
- Usage:
  node scripts/scrape-duotone-prices.mjs --category="https://www.duotonesports.com/en/kiteboarding/kites" --out=data/duotone-prices.json --headless=true
- The script will:
  - Visit category page(s) and discover product URLs
  - For each product page, find variant selectors (sizes) and extract price for each variant
  - Save a mapping of product -> { name, url, variants: [{ id?, label, price, currency }] }

Notes:
- Uses Playwright to run page JS and interact with variant buttons.
- Default headless=true. Use --limit=N to limit products for testing.
*/

import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [k, v] = arg.replace(/^--/, '').split('=');
      opts[k] = v === undefined ? true : v;
    }
  });
  return opts;
}

const opts = parseArgs();
const categoryUrl = opts.category || opts.url;
const outPath = opts.out || path.join(process.cwd(), 'data', 'duotone-prices.json');
const headless = opts.headless === 'false' ? false : true; // default true
const limit = opts.limit ? Number(opts.limit) : undefined;

if (!categoryUrl && !opts.product) {
  console.error('Error: provide --category or --product URL');
  process.exit(1);
}

// Heuristic price selectors (expand if needed)
const PRICE_SELECTORS = [
  '[data-testid="price"]',
  '.product-price',
  '.price',
  '.current-price',
  'span.price',
  'div.price',
  '.price--large',
  '.price--main'
];

async function discoverProductUrls(page, categoryUrl) {
  await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait a bit for lazy-loaded links
  await page.waitForTimeout(1000);

  // Gather all links that look like product pages
  const productUrls = await page.$$eval('a[href]', (links) => {
    const set = new Set();
    links.forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      // heuristics: contains '/products/' or '/en/products/' or '/products/' or '/en/[^/]+/[^/]+/[^/]+?'
      if (href.includes('/products/') || href.match(/\/products\/[^/]+/)) {
        try {
          const u = new URL(href, window.location.href).toString();
          set.add(u);
        } catch (e) {}
      }
    });
    return Array.from(set);
  });

  return productUrls;
}

// Try to find variant objects embedded on the page (window scope) and normalize them
async function parseWindowVariants(page) {
  try {
    const found = await page.evaluate(() => {
      const results = [];
      for (const k in window) {
        try {
          const v = window[k];
          if (v && typeof v === 'object' && Array.isArray(v.variants) && v.variants.length) {
            return v.variants.slice(0, 200); // return first found set
          }
        } catch (e) {}
      }
      return null;
    });

    if (found && Array.isArray(found)) {
      return found.map(v => ({ id: v.id || v.variant_id || v.id, label: v.option1 || v.title || v.name || (v.size ? String(v.size) : null), raw: v }));
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function extractVariantsFromProduct(page, productUrl) {
  const result = {
    url: productUrl,
    name: null,
    variants: []
  };

  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);

  // Try to extract product name
  const name = await page.$$eval('h1, [data-testid="product-title"], .product-title', els => (els[0] && els[0].innerText) ? els[0].innerText.trim() : null)
    .catch(() => null);
  result.name = name || (new URL(productUrl)).pathname.split('/').filter(Boolean).pop() || productUrl;

  // Try to parse variant data from inline scripts first (more reliable)
  async function parseVariantsFromScripts() {
    const scripts = await page.$$eval('script', nodes => nodes.map(n => n.innerText || '').join('\n'));

    // Common Shopify-like pattern: "variants": [ ... ]
    const jsonMatch = scripts.match(/\"variants\"\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/i);
    if (jsonMatch) {
      try {
        const variantsJson = JSON.parse(jsonMatch[1]);
        return variantsJson.map(v => ({ label: v.option1 || v.title || String(v.id), attrs: { id: v.id }, price: v.price || v.price_in_cents || null }));
      } catch (e) {
        // ignore parse errors
      }
    }

    // Try to find a JSON object that contains "product" and "variants"
    const prodMatch = scripts.match(/\"product\"\s*:\s*\{[\s\S]*?\"variants\"\s*:\s*(\[[\s\S]*?\])\s*\}/i);
    if (prodMatch) {
      try {
        const variantsJson = JSON.parse(prodMatch[1]);
        return variantsJson.map(v => ({ label: v.option1 || v.title || String(v.id), attrs: { id: v.id }, price: v.price || null }));
      } catch (e) {}
    }

    return null;
  }

  // Helper to read price from page (robust)
  async function readPriceText() {
    // Check meta tags / structured data
    const metaPrice = await page.$eval('meta[itemprop="price"], meta[property="product:price:amount"]', el => el && el.getAttribute && (el.getAttribute('content') || el.getAttribute('value'))).catch(() => null);
    if (metaPrice) return metaPrice.toString().trim();

    for (const sel of PRICE_SELECTORS) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        const txt = (await el.innerText()).trim();
        if (txt) return txt;
      }
    }

    // Fallback: any text snippet with euro symbol
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    const m = bodyText.match(/€\s?\d+[\d.,]*/);
    if (m) return m[0];
    return null;
  }

  // Helper: wait for price change after an action
  async function waitForPriceChange(prev, timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const cur = await readPriceText();
      if (cur !== prev) return cur;
      await page.waitForTimeout(150);
    }
    return await readPriceText();
  }

  // First, attempt to parse variants from scripts
  let parsedVariants = await parseVariantsFromScripts();
  if (parsedVariants && parsedVariants.length) {
    for (const pv of parsedVariants) {
      if (result.variants.length >= (limit || Infinity)) break;
      const prev = await readPriceText();
      // If we have an id, try to reload with ?variant=id which reliably updates price
      if (pv.attrs && pv.attrs.id) {
        const delimiter = productUrl.includes('?') ? '&' : '?';
        await page.goto(`${productUrl}${delimiter}variant=${pv.attrs.id}`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(250);
        const priceText = await readPriceText();
        result.variants.push({ label: String(pv.label), priceText, attrs: pv.attrs });
      } else {
        // fallback: attempt to find and click by label
        try {
          const clickable = await page.$(`text="${pv.label}"`);
          if (clickable) {
            await clickable.click().catch(() => {});
            const priceText = await waitForPriceChange(prev, 1500);
            result.variants.push({ label: String(pv.label), priceText, attrs: pv.attrs });
          } else {
            const priceText = await readPriceText();
            result.variants.push({ label: String(pv.label), priceText, attrs: pv.attrs });
          }
        } catch (e) {
          const priceText = await readPriceText();
          result.variants.push({ label: String(pv.label), priceText, attrs: pv.attrs });
        }
      }
    }
  } else {
    // Fallback to clicking variant buttons discovered on page
    const variantButtonSelectorCandidates = [
      '.button-select__button',
      '.variant-selector button',
      '.product-variant button',
      '.product-form__variants button',
      'button[data-variant]'
    ];

    // Wait briefly for buttons to render
    await page.waitForTimeout(500);

    // Get variant buttons and labels
    const variants = await page.$$eval(Array.from(new Set(variantButtonSelectorCandidates)).join(','), (buttons) => {
      if (!buttons || buttons.length === 0) return [];
      return buttons.map(btn => {
        const label = btn.innerText.trim();
        const data = {};
        if (btn.getAttributeNames) {
          for (const k of btn.getAttributeNames()) {
            data[k] = btn.getAttribute(k);
          }
        }
        return { label, attrs: data };
      }).filter(v => v.label && v.label.length > 0);
    }).catch(() => []);

    // If no variants found using heuristic, try to look for select/option controls
    if (!variants || variants.length === 0) {
      const selectVariants = await page.$$eval('select option', opts => opts.map(o => ({ label: o.innerText.trim(), attrs: { value: o.value } })).filter(o => o.label));
      if (selectVariants && selectVariants.length) variants.push(...selectVariants);
    }

    const seenLabels = new Set();
    for (let i = 0; i < variants.length; i++) {
      if (limit && result.variants.length >= limit) break;
      const v = variants[i];
      if (!v.label) continue;
      if (seenLabels.has(v.label)) continue;
      seenLabels.add(v.label);

      const prev = await readPriceText();
      try {
        const clickable = await page.$(`text="${v.label}"`);
        if (clickable) {
          await clickable.click().catch(() => {});
          const priceText = await waitForPriceChange(prev, 1500);
          result.variants.push({ label: v.label, priceText, attrs: v.attrs });
          continue;
        }

        // try matching by trimming or normalizing (e.g., "6.0 m" vs "6.0")
        const nodes = await page.$$(variantButtonSelectorCandidates.join(',')).catch(() => []);
        let clicked = false;
        for (const node of nodes) {
          const txt = (await node.innerText()).trim();
          if (txt === v.label || txt.startsWith(v.label) || txt.replace(/\s+/g, '') === v.label.replace(/\s+/g, '')) {
            await node.click().catch(() => {});
            const priceText = await waitForPriceChange(prev, 1500);
            result.variants.push({ label: v.label, priceText, attrs: v.attrs });
            clicked = true;
            break;
          }
        }
        if (clicked) continue;

        // last resort: just read price
        const priceText = await readPriceText();
        result.variants.push({ label: v.label, priceText, attrs: v.attrs });
      } catch (e) {
        const priceText = await readPriceText();
        result.variants.push({ label: v.label, priceText, attrs: v.attrs });
      }
    }
  }
  // If no variants were collected, still try to read base price
  if (result.variants.length === 0) {
    const priceText = await readPriceText();
    result.variants.push({ label: 'default', priceText });
  }

  return result;
}

(async () => {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  let productUrls = [];
  if (categoryUrl) {
    console.log('Discovering products from category:', categoryUrl);
    productUrls = await discoverProductUrls(page, categoryUrl);
    console.log(`Found ${productUrls.length} product URLs`);
  }

  if (opts.product) {
    productUrls = productUrls.concat(Array.isArray(opts.product) ? opts.product : [opts.product]);
  }

  // Deduplicate
  productUrls = Array.from(new Set(productUrls));

  if (limit) productUrls = productUrls.slice(0, limit);

  const results = [];
  for (let i = 0; i < productUrls.length; i++) {
    const u = productUrls[i];
    console.log(`\n[${i+1}/${productUrls.length}] Processing: ${u}`);
    try {
      const r = await extractVariantsFromProduct(page, u);
      console.log(`  -> ${r.name} (${r.variants.length} variants)`);
      r.variants.forEach(v => console.log(`     - ${v.label}: ${v.priceText}`));
      results.push(r);
    } catch (err) {
      console.warn('  Error extracting product', err.message || err);
    }

    // Respectful delay
    await page.waitForTimeout(500);
  }

  await browser.close();

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: categoryUrl, results }, null, 2), 'utf8');
  console.log('\nSaved results to', outPath);
})();
