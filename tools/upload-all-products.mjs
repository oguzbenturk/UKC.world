// Upload ALL scraped products to production
// Run: node tools/upload-all-products.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create axios instance with SSL bypass
const api = axios.create({
  baseURL: 'https://plannivo.com/api',
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

const API_URL = 'https://plannivo.com/api';
const CREDENTIALS = {
  email: 'admin@plannivo.com',
  password: 'asdasd35'
};

// Configuration
const DELAY_BETWEEN_PRODUCTS = 2000; // 2 seconds between products
const MAX_IMAGES_PER_BATCH = 8; // Upload max 8 images at once (safer limit)
const MAX_RETRIES = 3; // Retry failed uploads
const RETRY_DELAY = 3000; // 3 seconds between retries
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches

// Utility: Sleep/delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Image upload cache
const imageUploadCache = new Map();
const imageHashCache = new Map();

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// Recursively find all product-import.json files
function findAllProducts(baseDir) {
  const products = [];
  
  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.name === 'product-import.json') {
        // Found a product! Get parent folder as product folder
        const productFolder = path.dirname(fullPath);
        const relativePath = path.relative(baseDir, productFolder);
        products.push({
          name: relativePath,
          folder: productFolder,
          jsonPath: fullPath
        });
      }
    }
  }
  
  scanDirectory(baseDir);
  return products;
}

async function login() {
  console.log('🔐 Logging in...');
  const response = await api.post('/auth/login', CREDENTIALS);
  console.log('✅ Logged in successfully\n');
  return response.data.token;
}

async function uploadImage(token, imagePath, retryCount = 0) {
  // Use full path as cache key to avoid collisions between products with same filename
  if (imageUploadCache.has(imagePath)) {
    return imageUploadCache.get(imagePath);
  }
  
  const fileHash = getFileHash(imagePath);
  if (imageHashCache.has(fileHash)) {
    const cachedUrl = imageHashCache.get(fileHash);
    imageUploadCache.set(imagePath, cachedUrl);
    return cachedUrl;
  }
  
  try {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));
    
    const response = await api.post('/upload/image', formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      timeout: 30000
    });
    
    const uploadedUrl = response.data.url;
    imageUploadCache.set(imagePath, uploadedUrl);
    imageHashCache.set(fileHash, uploadedUrl);
    return uploadedUrl;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`      ⚠️  Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY);
      return uploadImage(token, imagePath, retryCount + 1);
    }
    throw error;
  }
}

async function uploadMultipleImages(token, imagePaths, retryCount = 0) {
  const results = [];
  const pathsToUpload = [];
  
  // Check cache first
  for (const imagePath of imagePaths) {
    const fileHash = getFileHash(imagePath);
    
    if (imageUploadCache.has(imagePath)) {
      results.push({ path: imagePath, url: imageUploadCache.get(imagePath), cached: true });
    } else if (imageHashCache.has(fileHash)) {
      const cachedUrl = imageHashCache.get(fileHash);
      imageUploadCache.set(imagePath, cachedUrl);
      results.push({ path: imagePath, url: cachedUrl, cached: true });
    } else {
      pathsToUpload.push(imagePath);
      results.push({ path: imagePath, url: null, cached: false });
    }
  }
  
  // Upload in batches if needed
  if (pathsToUpload.length > 0) {
    try {
      const batches = [];
      for (let i = 0; i < pathsToUpload.length; i += MAX_IMAGES_PER_BATCH) {
        batches.push(pathsToUpload.slice(i, i + MAX_IMAGES_PER_BATCH));
      }
      
      const allUploadedUrls = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        if (batches.length > 1) {
          console.log(`      📦 Batch ${batchIndex + 1}/${batches.length}: ${batch.length} images`);
        }
        
        const formData = new FormData();
        for (const imagePath of batch) {
          formData.append('images', fs.createReadStream(imagePath));
        }
        
        const response = await api.post('/upload/images', formData, {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders()
          },
          timeout: 60000 // 60 second timeout for large batches
        });
        
        allUploadedUrls.push(...response.data.images.map(img => img.url));
        
        // Delay between batches (longer for stability)
        if (batchIndex < batches.length - 1) {
          await sleep(DELAY_BETWEEN_BATCHES);
        }
      }
      
      // Map uploaded URLs back to results
      let uploadIndex = 0;
      for (let i = 0; i < results.length; i++) {
        if (!results[i].cached) {
          const uploadedUrl = allUploadedUrls[uploadIndex++];
          results[i].url = uploadedUrl;
          imageUploadCache.set(results[i].path, uploadedUrl);
          imageHashCache.set(getFileHash(results[i].path), uploadedUrl);
        }
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.log(`      ⚠️  Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        await sleep(RETRY_DELAY);
        return uploadMultipleImages(token, imagePaths, retryCount + 1);
      }
      throw error;
    }
  }
  
  return results.map(r => r.url);
}

async function createProduct(token, productData) {
  const response = await api.post('/products', productData, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.data;
}

async function uploadProduct(token, productConfig, progress) {
  console.log(`\n${progress} 📦 ${productConfig.name}`);
  
  // Read product-import.json
  const importData = JSON.parse(fs.readFileSync(productConfig.jsonPath, 'utf-8'));
  
  // Get images folder path
  const imagesFolder = path.join(productConfig.folder, 'images');
  if (!fs.existsSync(imagesFolder)) {
    throw new Error(`images folder not found`);
  }
  
  // Upload main image
  const mainImageFile = importData.image_url.replace('images/', '');
  const mainImagePath = path.join(imagesFolder, mainImageFile);
  const mainImageUrl = await uploadImage(token, mainImagePath);
  
  // Upload gallery images (excluding main image to avoid duplicate)
  const galleryFiles = importData.images
    .map(img => img.replace('images/', ''))
    .filter(img => img !== mainImageFile);
  
  let galleryUrls = [];
  if (galleryFiles.length > 0) {
    console.log(`   🖼️  Uploading ${galleryFiles.length + 1} images (1 main + ${galleryFiles.length} gallery)...`);
    const galleryPaths = galleryFiles.map(file => path.join(imagesFolder, file));
    galleryUrls = await uploadMultipleImages(token, galleryPaths);
  } else {
    console.log(`   🖼️  Uploading 1 image...`);
  }
  
  // Calculate price from first variant
  const price = importData.variants?.[0]?.price || 999;
  const costPrice = importData.variants?.[0]?.cost_price || price * 0.7;
  
  // Prepare product data
  const productData = {
    name: importData.name,
    description: importData.description,
    description_detailed: importData.description_detailed,
    sku: importData.sku,
    category: importData.category,
    subcategory: importData.subcategory || null,
    brand: importData.brand,
    price: price,
    cost_price: costPrice,
    currency: importData.currency || 'EUR',
    stock_quantity: importData.stock_quantity || 10,
    min_stock_level: 2,
    image_url: mainImageUrl,
    images: galleryUrls,
    status: 'active',
    is_featured: true,
    tags: [importData.brand, importData.category],
    variants: importData.variants || [],
    colors: importData.colors || [],
    gender: importData.gender || null,
    source_url: importData.source_url
  };
  
  const result = await createProduct(token, productData);
  console.log(`   ✅ Created! ID: ${result.id}`);
  
  return result;
}

async function main() {
  const downloadsDir = path.join(__dirname, 'image-scraper/downloads');
  
  console.log('='.repeat(70));
  console.log('🚀 BULK PRODUCT UPLOAD - ALL SCRAPED PRODUCTS');
  console.log('='.repeat(70));
  console.log(`📂 Scanning: ${downloadsDir}\n`);
  
  // Find all products
  const products = findAllProducts(downloadsDir);
  console.log(`✅ Found ${products.length} products to upload\n`);
  
  if (products.length === 0) {
    console.log('❌ No products found! Check the downloads folder.');
    process.exit(1);
  }
  
  // Ask for confirmation
  console.log('📋 Sample products:');
  products.slice(0, 5).forEach(p => console.log(`   - ${p.name}`));
  if (products.length > 5) {
    console.log(`   ... and ${products.length - 5} more`);
  }
  console.log('\n⏱️  Estimated time: ~' + Math.ceil((products.length * 2) / 60) + ' minutes');
  console.log('⚙️  Configuration:');
  console.log(`   - Delay between products: ${DELAY_BETWEEN_PRODUCTS / 1000}s`);
  console.log(`   - Max images per batch: ${MAX_IMAGES_PER_BATCH}`);
  console.log(`   - Retry attempts: ${MAX_RETRIES}`);
  console.log('\n' + '='.repeat(70) + '\n');
  
  try {
    // Login
    const token = await login();
    
    // Upload each product
    const results = [];
    const startTime = Date.now();
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = `[${i + 1}/${products.length}]`;
      
      try {
        const result = await uploadProduct(token, product, progress);
        results.push({ success: true, name: product.name, id: result.id });
        
        // Delay between products to avoid overwhelming the server
        if (i < products.length - 1) {
          await sleep(DELAY_BETWEEN_PRODUCTS);
        }
      } catch (error) {
        console.error(`${progress} ❌ Failed: ${error.message}`);
        if (error.response?.data) {
          console.error(`   API Error:`, error.response.data);
        }
        results.push({ success: false, name: product.name, error: error.message });
        
        // Still wait before next product even on error
        if (i < products.length - 1) {
          await sleep(DELAY_BETWEEN_PRODUCTS);
        }
      }
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 UPLOAD SUMMARY');
    console.log('='.repeat(70));
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Successful: ${successCount}/${results.length} products`);
    console.log(`❌ Failed: ${failCount}/${results.length} products`);
    console.log(`⏱️  Total time: ${elapsedTime} minutes`);
    console.log(`💾 Image cache: ${imageUploadCache.size} cached, ${imageHashCache.size} unique hashes`);
    
    if (failCount > 0) {
      console.log('\n❌ Failed products:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
