// backend/services/vendorProductSyncService.js
// Handles synchronization of external vendor catalogs (ION, Duotone) into the local products table.

import axios from 'axios';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { VENDOR_CATALOGS, VENDOR_KEY_MAP } from '../constants/vendorCatalogs.js';

const DEFAULT_TIMEOUT_MS = 15000;

const EXCLUDED_FIELDS_ON_UPDATE = new Set(['created_at', 'created_by', 'id']);

const REQUIRED_PRODUCT_FIELDS = ['sku', 'name', 'price'];

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  return value;
};

const pathGet = (obj, path, fallback = undefined) => {
  if (!path) return obj;
  const segments = path.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return fallback;
    }
  }
  return current ?? fallback;
};

const coerceArray = (maybeArray) => {
  if (!maybeArray) return [];
  if (Array.isArray(maybeArray)) return maybeArray;
  return [maybeArray];
};

const isValidVendorProduct = (product) => {
  return REQUIRED_PRODUCT_FIELDS.every((field) => product[field]);
};

const mapVendorProductToDb = (vendor, rawProduct) => {
  const {
    brand,
    defaultCategory,
    defaultCurrency
  } = vendor;

  const sku = rawProduct.sku || rawProduct.productCode || rawProduct.code || rawProduct.id;
  const name = rawProduct.name || rawProduct.title;
  const description = rawProduct.description || rawProduct.summary || null;
  const price = Number(rawProduct.price ?? rawProduct.retailPrice ?? rawProduct.msrp);
  const currency = rawProduct.currency || defaultCurrency || 'EUR';
  const category = rawProduct.category || rawProduct.group || defaultCategory || 'equipment';
  const brandLabel = rawProduct.brand || brand;
  const stockQuantity = Number.isFinite(rawProduct.stock)
    ? Number(rawProduct.stock)
    : Number(rawProduct.inventory ?? rawProduct.availability ?? 0);
  const status = stockQuantity > 0 ? 'active' : 'archived';
  const imageUrl = rawProduct.image || rawProduct.thumbnail || rawProduct.image_url || null;
  const imagesArray = coerceArray(rawProduct.images ?? rawProduct.gallery);
  const supplierInfo = {
    vendor: vendor.key,
    sourceUrl: rawProduct.url || rawProduct.link || null,
    lastSyncedAt: new Date().toISOString(),
    externalUpdatedAt: rawProduct.updatedAt || rawProduct.lastUpdated || null
  };

  return {
    sku,
    name,
    description,
    category,
    brand: brandLabel,
    price: Number.isFinite(price) ? price : null,
    cost_price: rawProduct.costPrice && Number.isFinite(Number(rawProduct.costPrice))
      ? Number(rawProduct.costPrice)
      : null,
    currency,
    stock_quantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
    min_stock_level: rawProduct.minStock || rawProduct.reorderLevel || 0,
    weight: rawProduct.weight || null,
    dimensions: rawProduct.dimensions || rawProduct.size || null,
    image_url: imageUrl,
    images: imagesArray,
    status,
    is_featured: Boolean(rawProduct.isFeatured || rawProduct.featured),
    tags: rawProduct.tags || [],
    supplier_info: supplierInfo
  };
};

const buildUpsertStatement = () => {
  const columns = [
    'sku',
    'name',
    'description',
    'category',
    'brand',
    'price',
    'cost_price',
    'currency',
    'stock_quantity',
    'min_stock_level',
    'weight',
    'dimensions',
    'image_url',
    'images',
    'status',
    'is_featured',
    'tags',
    'supplier_info'
  ];

  const insertPlaceholders = columns.map((_, idx) => `$${idx + 1}`);

  const updateAssignments = columns
    .filter((column) => !EXCLUDED_FIELDS_ON_UPDATE.has(column))
    .map((column) => {
      if (['images', 'tags', 'dimensions', 'supplier_info'].includes(column)) {
        return `${column} = EXCLUDED.${column}`;
      }
      return `${column} = EXCLUDED.${column}`;
    });

  updateAssignments.push('updated_at = NOW()');

  const query = `
    INSERT INTO products (${columns.join(', ')})
    VALUES (${insertPlaceholders.join(', ')})
    ON CONFLICT (sku)
    DO UPDATE SET ${updateAssignments.join(', ')}
    RETURNING id, sku, (xmax = 0) AS inserted;
  `;

  return { columns, query };
};

const { columns: UPSERT_COLUMNS, query: UPSERT_QUERY } = buildUpsertStatement();

const prepareUpsertValues = (payload) => {
  return UPSERT_COLUMNS.map((column) => {
    if (column === 'images' || column === 'tags' || column === 'dimensions' || column === 'supplier_info') {
      const value = normalizeValue(payload[column]);
      if (value === null) {
        return null;
      }
      return JSON.stringify(value);
    }
    return normalizeValue(payload[column]);
  });
};

const fetchVendorFeed = async (vendor) => {
  const { envFeedUrl, key, extraction, enabledEnvFlag, apiKeyEnv } = vendor;
  if (enabledEnvFlag && process.env[enabledEnvFlag] === 'false') {
    logger.info(`[vendor-sync] ${key} sync disabled via env flag ${enabledEnvFlag}`);
    return [];
  }

  const feedUrl = process.env[envFeedUrl];
  if (!feedUrl) {
    logger.warn(`[vendor-sync] Missing env ${envFeedUrl} for vendor ${key}, skipping sync.`);
    return [];
  }

  const headers = {};
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await axios.get(feedUrl, {
      timeout: DEFAULT_TIMEOUT_MS,
      headers: Object.keys(headers).length ? headers : undefined
    });
    let rawData = response.data;
    if (extraction?.dataPath) {
      rawData = pathGet(rawData, extraction.dataPath, []);
    }
    if (!Array.isArray(rawData)) {
      logger.warn(`[vendor-sync] Feed for ${key} did not resolve to an array.`, {
        resolvedType: typeof rawData
      });
      return [];
    }
    return rawData;
  } catch (error) {
    logger.error(`[vendor-sync] Failed to fetch feed for ${key}: ${error.message}`);
    return [];
  }
};

export const syncVendorProducts = async ({ vendorKeys, dryRun = false } = {}) => {
  const vendorsToSync = vendorKeys && vendorKeys.length
    ? vendorKeys.map((key) => VENDOR_KEY_MAP[key]).filter(Boolean)
    : VENDOR_CATALOGS;

  if (vendorsToSync.length === 0) {
    return { syncedVendors: [], dryRun, productsProcessed: 0, productsInserted: 0, productsUpdated: 0 };
  }

  const client = await pool.connect();
  const summary = {
    syncedVendors: [],
    dryRun,
    productsProcessed: 0,
    productsInserted: 0,
    productsUpdated: 0,
    skipped: []
  };

  try {
    for (const vendor of vendorsToSync) {
      const rawProducts = await fetchVendorFeed(vendor);
      if (!rawProducts.length) {
        summary.skipped.push({ vendor: vendor.key, reason: 'No products returned or feed unavailable' });
        continue;
      }

      const validProducts = [];
      for (const rawProduct of rawProducts) {
        const mapped = mapVendorProductToDb(vendor, rawProduct);
        if (!isValidVendorProduct(mapped)) {
          summary.skipped.push({ vendor: vendor.key, reason: 'Missing required fields', sku: mapped?.sku });
          continue;
        }
        validProducts.push(mapped);
      }

      if (!validProducts.length) {
        summary.skipped.push({ vendor: vendor.key, reason: 'No valid products after normalization' });
        continue;
      }

      if (!dryRun) {
        await client.query('BEGIN');
      }

      try {
        for (const product of validProducts) {
          summary.productsProcessed += 1;
          if (dryRun) {
            continue;
          }

          const upsertValues = prepareUpsertValues(product);
          const result = await client.query(UPSERT_QUERY, upsertValues);
          const row = result?.rows?.[0];
          if (!row) {
            continue;
          }

          if (row.inserted) {
            summary.productsInserted += 1;
          } else {
            summary.productsUpdated += 1;
          }
        }

        if (!dryRun) {
          await client.query('COMMIT');
        }

        summary.syncedVendors.push({ vendor: vendor.key, total: validProducts.length });
      } catch (error) {
        if (!dryRun) {
          await client.query('ROLLBACK');
        }
        logger.error(`[vendor-sync] Failed to upsert products for ${vendor.key}: ${error.message}`);
        summary.skipped.push({ vendor: vendor.key, reason: 'Upsert failed', error: error.message });
      }
    }
  } finally {
    client.release();
  }

  return summary;
};

export default syncVendorProducts;
