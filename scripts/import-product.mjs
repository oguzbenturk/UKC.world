/**
 * Product Import Script for Plannivo Shop
 * 
 * This script:
 * 1. Logs in with admin credentials to get auth token
 * 2. Uploads product images to the server
 * 3. Creates the product with all metadata
 * 
 * Usage: node scripts/import-product.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = 'https://plannivo.com'; // Production server
const CREDENTIALS = {
    email: 'admin@plannivo.com',
    password: 'asdasd35'
};

// Product data folder
const PRODUCT_FOLDER = path.join(__dirname, '../tools/image-scraper/downloads/Duotone/Kites/D-LAB/Rebel D-LAB');

/**
 * Login and get auth token
 */
async function login() {
    console.log('🔐 Logging in...');
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(CREDENTIALS)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Login failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log('✅ Login successful');
    return data.token;
}

/**
 * Upload a single image and return the URL
 */
async function uploadImage(token, imagePath) {
    const fileName = path.basename(imagePath);
    console.log(`📤 Uploading ${fileName}...`);

    const fileBuffer = fs.readFileSync(imagePath);
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    
    const formData = new FormData();
    formData.append('image', blob, fileName);

    const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Image upload failed for ${fileName}: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`   ✅ Uploaded: ${data.url}`);
    return data.url;
}

/**
 * Upload multiple images
 */
async function uploadImages(token, imagePaths) {
    console.log(`\n📦 Uploading ${imagePaths.length} images...`);
    
    const formData = new FormData();
    
    for (const imagePath of imagePaths) {
        const fileName = path.basename(imagePath);
        const fileBuffer = fs.readFileSync(imagePath);
        const blob = new Blob([fileBuffer], { type: 'image/png' });
        formData.append('images', blob, fileName);
    }

    const response = await fetch(`${API_BASE_URL}/api/upload/images`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Multiple image upload failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`   ✅ Uploaded ${data.count} images`);
    return data.images.map(img => img.url);
}

/**
 * Create product in shop
 */
async function createProduct(token, productData) {
    console.log('\n🛒 Creating product...');
    
    const response = await fetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Product creation failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Product created successfully!`);
    console.log(`   ID: ${data.id}`);
    console.log(`   Name: ${data.name}`);
    console.log(`   SKU: ${data.sku}`);
    return data;
}

/**
 * Main import function
 */
async function importProduct() {
    console.log('═══════════════════════════════════════════════');
    console.log('    PLANNIVO PRODUCT IMPORT SCRIPT');
    console.log('═══════════════════════════════════════════════\n');

    try {
        // 1. Read product data
        const productJsonPath = path.join(PRODUCT_FOLDER, 'product-import.json');
        if (!fs.existsSync(productJsonPath)) {
            throw new Error(`Product JSON not found: ${productJsonPath}`);
        }
        
        const rawData = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));
        console.log(`📋 Product: ${rawData.name}`);
        console.log(`   Brand: ${rawData.brand}`);
        console.log(`   Variants: ${rawData.variants?.length || 0}`);
        console.log(`   Images: ${rawData.images?.length || 0}`);

        // 2. Login
        const token = await login();

        // 3. Upload main image
        const mainImagePath = path.join(PRODUCT_FOLDER, rawData.image_url);
        if (!fs.existsSync(mainImagePath)) {
            throw new Error(`Main image not found: ${mainImagePath}`);
        }
        const mainImageUrl = await uploadImage(token, mainImagePath);

        // 4. Upload gallery images (excluding main if it's the same)
        const galleryPaths = rawData.images
            .filter(img => img !== rawData.image_url)
            .map(img => path.join(PRODUCT_FOLDER, img))
            .filter(p => fs.existsSync(p));

        let galleryUrls = [];
        if (galleryPaths.length > 0) {
            galleryUrls = await uploadImages(token, galleryPaths);
        }

        // 5. Prepare product data
        // Use the first variant's price as the base price
        const baseVariant = rawData.variants?.[0] || {};
        const basePrice = baseVariant.price || 2899;
        const costPrice = baseVariant.cost_price || null;

        const productData = {
            name: rawData.name,
            description: `Premium ${rawData.brand} ${rawData.name} kite. High-performance D/LAB construction with cutting-edge materials for maximum performance.`,
            sku: rawData.sku,
            category: 'kites', // Map to our category system
            brand: rawData.brand,
            price: basePrice,
            cost_price: costPrice,
            currency: rawData.currency || 'EUR',
            stock_quantity: rawData.stock_quantity || 5,
            min_stock_level: 2,
            image_url: mainImageUrl,
            images: galleryUrls,
            status: 'active',
            is_featured: true,
            tags: ['kite', 'duotone', 'd-lab', 'premium', '2026'],
            variants: rawData.variants,
            source_url: rawData.source_url
        };

        console.log('\n📝 Product data prepared:');
        console.log(`   Price: €${productData.price}`);
        console.log(`   Cost: €${productData.cost_price}`);
        console.log(`   Stock: ${productData.stock_quantity}`);
        console.log(`   Images: 1 main + ${galleryUrls.length} gallery`);

        // 6. Create product
        const createdProduct = await createProduct(token, productData);

        console.log('\n═══════════════════════════════════════════════');
        console.log('    ✅ IMPORT COMPLETED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════');
        console.log(`\nView product: ${API_BASE_URL.replace('api.', 'app.')}/dashboard/products/${createdProduct.id}`);

        return createdProduct;

    } catch (error) {
        console.error('\n❌ Import failed:', error.message);
        process.exit(1);
    }
}

// Run the import
importProduct();
