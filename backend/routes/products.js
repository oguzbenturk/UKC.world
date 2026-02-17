// backend/routes/products.js
// API routes for product management (retail/sales items)

import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { syncVendorProducts } from '../services/vendorProductSyncService.js';
import {
  upsertProductRecommendation,
  removeProductRecommendation,
  getRecommendationMetadata
} from '../services/recommendationService.js';

const router = express.Router();

// Rate limiter for public API endpoints (guests)
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

// Get all products with filtering and pagination
// Made public for guest browsing - no auth required, rate limited
router.get('/', publicApiLimiter, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      subcategory,
      status = 'active',
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      low_stock = false
    } = req.query;

    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Status filter
    if (status && status !== 'all') {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }

    // Category filter
    if (category && category !== 'all') {
      whereConditions.push(`category = $${paramIndex++}`);
      queryParams.push(category);
    }

    // Subcategory filter (supports parent filtering: 'men' matches 'men', 'men-shorty', 'men-long', etc.)
    if (subcategory && subcategory !== 'all') {
      // Match exact subcategory OR children (subcategory starts with parent-)
      whereConditions.push(`(subcategory = $${paramIndex} OR subcategory LIKE $${paramIndex + 1})`);
      queryParams.push(subcategory);
      queryParams.push(`${subcategory}-%`);
      paramIndex += 2;
    }

    // Search filter
    if (search) {
      whereConditions.push(`(
        name ILIKE $${paramIndex} OR 
        description ILIKE $${paramIndex} OR 
        sku ILIKE $${paramIndex} OR
        brand ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Low stock filter
    if (low_stock === 'true') {
      whereConditions.push(`stock_quantity <= min_stock_level`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Validate sort column
    const validSortColumns = ['name', 'price', 'stock_quantity', 'created_at', 'category'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = ['ASC', 'DESC'].includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get products
    const productsQuery = `
      SELECT 
        id,
        name,
        description,
        sku,
        category,
        brand,
        price,
        cost_price,
        currency,
        stock_quantity,
        min_stock_level,
        weight,
        dimensions,
        image_url,
        images,
        status,
        is_featured,
        tags,
        supplier_info,
        variants,
        colors,
        gender,
        sizes,
        source_url,
        created_at,
        updated_at,
        CASE 
          WHEN stock_quantity <= min_stock_level THEN true 
          ELSE false 
        END as is_low_stock,
        CASE 
          WHEN cost_price IS NOT NULL AND cost_price > 0 
          THEN ROUND(((price - cost_price) / cost_price * 100)::numeric, 2)
          ELSE NULL 
        END as profit_margin_percent
      FROM products
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    queryParams.push(limit, offset);
    const result = await pool.query(productsQuery, queryParams);

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch products' });
  }
});

// Get products grouped by category (for shop homepage)
// Returns up to 10 products per category
// Public endpoint - guests can browse shop
router.get('/shop/by-category', publicApiLimiter, async (req, res) => {
  try {
    const { limit_per_category = 10 } = req.query;
    
    // Get all active categories with products
    const categoriesQuery = `
      SELECT DISTINCT category
      FROM products
      WHERE status = 'active' AND stock_quantity > 0
      ORDER BY category
    `;
    const categoriesResult = await pool.query(categoriesQuery);
    const categories = categoriesResult.rows.map(row => row.category);
    
    // Fetch products for each category
    const categoryGroups = {};
    
    for (const category of categories) {
      const productsQuery = `
        SELECT 
          id,
          name,
          description,
          sku,
          category,
          subcategory,
          brand,
          price,
          cost_price,
          currency,
          stock_quantity,
          min_stock_level,
          weight,
          dimensions,
          image_url,
          images,
          status,
          is_featured,
          tags,
          variants,
          colors,
          gender,
          sizes,
          source_url,
          created_at,
          updated_at,
          CASE 
            WHEN stock_quantity <= min_stock_level THEN true 
            ELSE false 
          END as is_low_stock
        FROM products
        WHERE status = 'active' 
          AND category = $1
          AND stock_quantity > 0
        ORDER BY 
          is_featured DESC,
          created_at DESC
        LIMIT $2
      `;
      
      const result = await pool.query(productsQuery, [category, limit_per_category]);
      
      // Group by subcategory if available
      const subcategoryGroups = {};
      result.rows.forEach(product => {
        const subcat = product.subcategory || 'general';
        if (!subcategoryGroups[subcat]) {
          subcategoryGroups[subcat] = [];
        }
        subcategoryGroups[subcat].push(product);
      });
      
      categoryGroups[category] = {
        products: result.rows,
        subcategories: subcategoryGroups,
        total: result.rows.length
      };
    }
    
    res.json({
      success: true,
      categories: categoryGroups,
      categoriesList: categories
    });

  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch products by category' });
  }
});

// Get available subcategories (all or by category)
// Public endpoint - guests can view subcategories
router.get('/subcategories', publicApiLimiter, async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT 
        category,
        subcategory,
        display_name,
        display_order
      FROM product_subcategories
      WHERE is_active = true
    `;
    
    const params = [];
    if (category && category !== 'all') {
      query += ` AND category = $1`;
      params.push(category);
    }
    
    query += ` ORDER BY category, display_order`;
    
    const result = await pool.query(query, params);
    
    // Group by category
    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.category]) {
        grouped[row.category] = [];
      }
      grouped[row.category].push({
        value: row.subcategory,
        label: row.display_name,
        order: row.display_order
      });
    });
    
    res.json({
      success: true,
      subcategories: category ? (grouped[category] || []) : result.rows,
      grouped
    });

  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch subcategories' });
  }
});

// Trigger external vendor product synchronization (ION, Duotone...)
router.post('/vendors/sync', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { vendors, dryRun = false } = req.body ?? {};
    const vendorKeys = Array.isArray(vendors)
      ? vendors.map((key) => String(key).toLowerCase())
      : undefined;

    const result = await syncVendorProducts({ vendorKeys, dryRun: parseBoolean(dryRun) });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error syncing vendor catalogs:', error);
    res.status(500).json({ error: true, message: 'Failed to sync vendor catalogs' });
  }
});

// Get product by ID
// Public endpoint - guests can view product details
router.get('/:id', publicApiLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        *,
        CASE 
          WHEN stock_quantity <= min_stock_level THEN true 
          ELSE false 
        END as is_low_stock,
        CASE 
          WHEN cost_price IS NOT NULL AND cost_price > 0 
          THEN ROUND(((price - cost_price) / cost_price * 100)::numeric, 2)
          ELSE NULL 
        END as profit_margin_percent
      FROM products 
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch product' });
  }
});

// Create new product
router.post('/', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const {
      name,
      description,
      description_detailed,
      sku,
      category,
      subcategory,
      brand,
      price,
      cost_price,
      currency = 'EUR',
      stock_quantity = 0,
      min_stock_level = 0,
      weight,
      dimensions,
      image_url,
      images,
      status = 'active',
      is_featured = false,
      tags,
      supplier_info,
      variants,
      colors,
      gender,
      sizes,
      source_url
    } = req.body;

    // Validation
    if (!name || !category || price === undefined) {
      return res.status(400).json({ 
        error: true, 
        message: 'Name, category, and price are required' 
      });
    }

    if (price < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Price must be non-negative' 
      });
    }

    if (cost_price !== undefined && cost_price < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Cost price must be non-negative' 
      });
    }

    if (stock_quantity < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Stock quantity must be non-negative' 
      });
    }

    const query = `
      INSERT INTO products (
        name, description, description_detailed, sku, category, subcategory, brand, 
        price, cost_price, currency, stock_quantity, min_stock_level, weight, dimensions, 
        image_url, images, status, is_featured, tags, supplier_info, created_by,
        variants, colors, gender, sizes, source_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *
    `;

    const values = [
      name, description, description_detailed, sku, category, subcategory, brand, 
      price, cost_price, currency, stock_quantity, min_stock_level, weight, 
      dimensions ? JSON.stringify(dimensions) : null,
      image_url, 
      images ? JSON.stringify(images) : null,
      status, is_featured, 
      tags ? JSON.stringify(tags) : null,
      supplier_info ? JSON.stringify(supplier_info) : null,
      req.user.id,
      variants ? JSON.stringify(variants) : null,
      colors ? JSON.stringify(colors) : null,
      gender,
      sizes ? JSON.stringify(sizes) : null,
      source_url
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error creating product:', error);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error message:', error.message);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ 
        error: true, 
        message: 'SKU already exists. Please use a unique SKU.' 
      });
    }
    
    res.status(500).json({ 
      error: true, 
      message: 'Failed to create product',
      details: error.message 
    });
  }
});

// Update product
router.put('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      sku,
      category,
      brand,
      price,
      cost_price,
      currency,
      stock_quantity,
      min_stock_level,
      weight,
      dimensions,
      image_url,
      images,
      status,
      is_featured,
      tags,
      supplier_info,
      variants,
      colors,
      gender,
      sizes,
      source_url
    } = req.body;

    // Validation
    if (price !== undefined && price < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Price must be non-negative' 
      });
    }

    if (cost_price !== undefined && cost_price < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Cost price must be non-negative' 
      });
    }

    if (stock_quantity !== undefined && stock_quantity < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Stock quantity must be non-negative' 
      });
    }

    const query = `
      UPDATE products 
      SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        sku = COALESCE($4, sku),
        category = COALESCE($5, category),
        brand = COALESCE($6, brand),
        price = COALESCE($7, price),
        cost_price = COALESCE($8, cost_price),
        currency = COALESCE($9, currency),
        stock_quantity = COALESCE($10, stock_quantity),
        min_stock_level = COALESCE($11, min_stock_level),
        weight = COALESCE($12, weight),
        dimensions = COALESCE($13, dimensions),
        image_url = COALESCE($14, image_url),
        images = COALESCE($15, images),
        status = COALESCE($16, status),
        is_featured = COALESCE($17, is_featured),
        tags = COALESCE($18, tags),
        supplier_info = COALESCE($19, supplier_info),
        updated_by = $20,
        variants = COALESCE($21, variants),
        colors = COALESCE($22, colors),
        gender = COALESCE($23, gender),
        sizes = COALESCE($24, sizes),
        source_url = COALESCE($25, source_url)
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      id, name, description, sku, category, brand, price, cost_price, currency,
      stock_quantity, min_stock_level, weight, 
      dimensions ? JSON.stringify(dimensions) : null,
      image_url, 
      images ? JSON.stringify(images) : null,
      status, is_featured, 
      tags ? JSON.stringify(tags) : null,
      supplier_info ? JSON.stringify(supplier_info) : null,
      req.user.id,
      variants ? JSON.stringify(variants) : null,
      colors ? JSON.stringify(colors) : null,
      gender,
      sizes ? JSON.stringify(sizes) : null,
      source_url
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Product not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error updating product:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ 
        error: true, 
        message: 'SKU already exists. Please use a unique SKU.' 
      });
    }
    
    res.status(500).json({ error: true, message: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'DELETE FROM products WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Product not found' });
    }
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: true, message: 'Failed to delete product' });
  }
});

// Update stock quantity (for inventory management)
router.patch('/:id/stock', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { stock_quantity, reason } = req.body;

    if (stock_quantity === undefined || stock_quantity < 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Valid stock quantity is required' 
      });
    }

    const query = `
      UPDATE products 
      SET stock_quantity = $2, updated_by = $3
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id, stock_quantity, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Product not found' });
    }

    // TODO: Log stock change in audit table with reason
    // This would be useful for inventory tracking

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: true, message: 'Failed to update stock' });
  }
});

// Get product categories
// Public endpoint - guests can view categories
router.get('/categories/list', publicApiLimiter, async (req, res) => {
  try {
    const query = `
      SELECT 
        category,
        COUNT(*) as product_count,
        AVG(price) as avg_price,
        SUM(stock_quantity) as total_stock
      FROM products 
      WHERE status = 'active'
      GROUP BY category 
      ORDER BY category
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch categories' });
  }
});

// Get low stock products
router.get('/inventory/low-stock', authenticateJWT, async (req, res) => {
  try {
    const query = `
      SELECT 
        id, name, sku, category, stock_quantity, min_stock_level, price
      FROM products 
      WHERE stock_quantity <= min_stock_level AND status = 'active'
      ORDER BY (stock_quantity - min_stock_level) ASC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch low stock products' });
  }
});

router.get('/:id/recommendation', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const metadata = await getRecommendationMetadata(req.params.id, req.query.role || 'student');
    res.json({ metadata });
  } catch (error) {
    console.error('Error fetching product recommendation metadata:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch recommendation metadata' });
  }
});

router.post('/:id/recommendation', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role = 'student', priority = 5, isFeatured = false, metadata = {} } = req.body || {};

    const recommendation = await upsertProductRecommendation({
      productId: id,
      recommendedForRole: role,
      priority: Number(priority) || 5,
      isFeatured: Boolean(isFeatured),
      metadata,
      userId: req.user.id
    });

    res.status(201).json(recommendation);
  } catch (error) {
    console.error('Error saving product recommendation:', error);
    res.status(500).json({ error: true, message: 'Failed to update recommendation state' });
  }
});

router.delete('/:id/recommendation', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    await removeProductRecommendation(req.params.id, req.query.role || 'student');
    res.status(204).send();
  } catch (error) {
    console.error('Error removing product recommendation:', error);
    res.status(500).json({ error: true, message: 'Failed to remove recommendation' });
  }
});

export default router;
