#!/usr/bin/env node
/**
 * Fix Variant Data Script
 * 
 * Fixes scraped product-import.json files where:
 * 1. Wetsuit sizes are combined into a single variant (e.g., "48/S, 50/M, 52/L")
 *    → Split into separate variants per size
 * 2. Colors are stored as objects but need to be in correct format for modal
 * 
 * Usage:
 *   node fix-variants.mjs                    # Fix all products in downloads/
 *   node fix-variants.mjs --dry-run          # Preview changes without modifying files
 *   node fix-variants.mjs --path ION         # Fix only ION products
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');

// Find --path argument more carefully
let PATH_FILTER = null;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--path=')) {
    PATH_FILTER = arg.split('=')[1];
    break;
  }
  if (arg === '--path' && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
    PATH_FILTER = process.argv[i + 1];
    break;
  }
}

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

let stats = {
  scanned: 0,
  fixed: 0,
  skipped: 0,
  errors: 0
};

/**
 * Check if variants need fixing (sizes combined into single variant)
 */
function needsSizeFix(variants) {
  if (!Array.isArray(variants) || variants.length !== 1) return false;
  
  const variant = variants[0];
  const label = variant.label || variant.size || '';
  
  // Check if label contains comma-separated sizes (e.g., "48/S, 50/M, 52/L")
  return label.includes(',') && (label.match(/,/g) || []).length >= 2;
}

/**
 * Fix combined sizes by splitting into separate variants
 */
function fixVariants(variants) {
  if (!needsSizeFix(variants)) return variants;
  
  const original = variants[0];
  const combinedSizes = original.label || original.size || '';
  
  // Split by comma, trim each size
  const sizes = combinedSizes.split(',').map(s => s.trim()).filter(Boolean);
  
  // Create separate variant for each size with same price info
  return sizes.map(size => ({
    label: size,
    size: size,
    price: original.price,
    price_final: original.price_final,
    cost_price: original.cost_price
  }));
}

/**
 * Process a single product-import.json file
 */
async function processProductFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const product = JSON.parse(content);
    
    stats.scanned++;
    
    let modified = false;
    const changes = [];
    
    // Check if variants need fixing
    if (needsSizeFix(product.variants)) {
      const oldCount = product.variants.length;
      const oldLabel = product.variants[0]?.label || 'N/A';
      
      product.variants = fixVariants(product.variants);
      
      changes.push(`  📦 Variants: ${oldCount} → ${product.variants.length} (split "${oldLabel.substring(0, 40)}...")`);
      modified = true;
    }
    
    if (modified) {
      const relativePath = path.relative(DOWNLOADS_DIR, filePath);
      console.log(`\n✨ ${relativePath}`);
      changes.forEach(c => console.log(c));
      
      if (!DRY_RUN) {
        await fs.writeFile(filePath, JSON.stringify(product, null, 2));
        console.log('  ✅ Saved');
      } else {
        console.log('  🔍 Dry run - no changes saved');
      }
      
      stats.fixed++;
    } else {
      stats.skipped++;
    }
  } catch (err) {
    console.error(`❌ Error processing ${filePath}: ${err.message}`);
    stats.errors++;
  }
}

/**
 * Recursively find all product-import.json files
 */
async function findProductFiles(dir, files = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Apply path filter if specified
        if (PATH_FILTER && dir === DOWNLOADS_DIR && !entry.name.toLowerCase().includes(PATH_FILTER.toLowerCase())) {
          continue;
        }
        await findProductFiles(fullPath, files);
      } else if (entry.name === 'product-import.json') {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

async function main() {
  console.log('🔧 Variant Fixer Script');
  console.log('========================');
  console.log(`📁 Scanning: ${DOWNLOADS_DIR}`);
  if (PATH_FILTER) console.log(`🔍 Filter: ${PATH_FILTER}`);
  if (DRY_RUN) console.log('🔍 DRY RUN MODE - No files will be modified');
  console.log('');
  
  try {
    await fs.access(DOWNLOADS_DIR);
  } catch {
    console.error(`❌ Downloads directory not found: ${DOWNLOADS_DIR}`);
    process.exit(1);
  }
  
  const files = await findProductFiles(DOWNLOADS_DIR);
  console.log(`📋 Found ${files.length} product files\n`);
  
  for (const file of files) {
    await processProductFile(file);
  }
  
  console.log('\n========================');
  console.log('📊 Summary:');
  console.log(`   Scanned: ${stats.scanned}`);
  console.log(`   Fixed: ${stats.fixed}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors}`);
  
  if (DRY_RUN && stats.fixed > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main().catch(console.error);
