import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const DEFAULT_LIMIT = 8;

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const mapProductRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  sku: row.sku,
  category: row.category,
  brand: row.brand,
  price: Number(row.price) || 0,
  currency: row.currency || 'EUR',
  stockQuantity: Number(row.stock_quantity) || 0,
  minStockLevel: Number(row.min_stock_level) || 0,
  imageUrl: row.image_url,
  images: parseJson(row.images) || [],
  status: row.status,
  isFeatured: row.is_featured,
  supplierInfo: parseJson(row.supplier_info),
  tags: parseJson(row.tags) || [],
  priority: row.priority,
  recommendedForRole: row.recommended_for_role,
  recommendationId: row.recommendation_id,
  recommendationMetadata: parseJson(row.recommendation_metadata) || {}
});

export async function getRecommendedProductsForRole(role = 'student', limit = DEFAULT_LIMIT) {
  const client = await pool.connect();
  try {
    const roleValue = role === 'all' ? null : role;

    const { rows } = await client.query(
      `SELECT
         rp.id AS recommendation_id,
         rp.recommended_for_role,
         rp.priority,
         rp.is_featured,
         rp.metadata AS recommendation_metadata,
         p.*
       FROM recommended_products rp
       JOIN products p ON p.id = rp.product_id
      WHERE (rp.recommended_for_role = $1 OR rp.recommended_for_role = 'all')
        AND p.status = 'active'
      ORDER BY rp.priority DESC, rp.is_featured DESC, rp.updated_at DESC
      LIMIT $2`,
      [roleValue || 'student', Math.max(1, limit)]
    );

    return rows.map(mapProductRow);
  } catch (error) {
    logger.error('Failed to load recommended products', { role, error: error.message });
    return [];
  } finally {
    client.release();
  }
}

export async function upsertProductRecommendation({
  productId,
  recommendedForRole = 'student',
  priority = 5,
  isFeatured = false,
  metadata = {},
  userId
}) {
  if (!productId) {
    throw new Error('productId is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO recommended_products (
         product_id,
         recommended_for_role,
         priority,
         is_featured,
         metadata,
         created_by
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (product_id, recommended_for_role)
       DO UPDATE SET
         priority = EXCLUDED.priority,
         is_featured = EXCLUDED.is_featured,
         metadata = EXCLUDED.metadata,
         created_by = COALESCE(EXCLUDED.created_by, recommended_products.created_by),
         updated_at = NOW()` ,
      [productId, recommendedForRole, priority, isFeatured, JSON.stringify(metadata), userId || null]
    );

    await client.query('COMMIT');

    return {
      productId,
      recommendedForRole,
      priority,
      isFeatured,
      metadata
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to upsert product recommendation', {
      productId,
      recommendedForRole,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function removeProductRecommendation(productId, recommendedForRole = 'student') {
  if (!productId) {
    throw new Error('productId is required');
  }

  await pool.query(
    `DELETE FROM recommended_products
      WHERE product_id = $1
        AND (recommended_for_role = $2 OR $2 = 'all')`,
    [productId, recommendedForRole || 'student']
  );
}

export async function getRecommendationMetadata(productId, recommendedForRole = 'student') {
  const { rows } = await pool.query(
    `SELECT metadata
       FROM recommended_products
      WHERE product_id = $1
        AND recommended_for_role = $2`,
    [productId, recommendedForRole || 'student']
  );

  return rows.length ? parseJson(rows[0].metadata) || {} : {};
}
