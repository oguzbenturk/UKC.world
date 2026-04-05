/**
 * Multi-Currency Price Service
 * Handles CRUD operations for service and package prices across multiple currencies
 */

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Get all prices for a service
 * @param {string} serviceId - Service UUID
 * @returns {Array} Array of {currency_code, price}
 */
export async function getServicePrices(serviceId) {
  const { rows } = await pool.query(
    'SELECT currency_code, price FROM service_prices WHERE service_id = $1 ORDER BY currency_code',
    [serviceId]
  );
  return rows.map(r => ({
    currencyCode: r.currency_code,
    price: parseFloat(r.price)
  }));
}

/**
 * Get all prices for a package
 * @param {string} packageId - Package UUID
 * @returns {Array} Array of {currency_code, price}
 */
export async function getPackagePrices(packageId) {
  const { rows } = await pool.query(
    'SELECT currency_code, price FROM package_prices WHERE package_id = $1 ORDER BY currency_code',
    [packageId]
  );
  return rows.map(r => ({
    currencyCode: r.currency_code,
    price: parseFloat(r.price)
  }));
}

/**
 * Set prices for a service (replaces all existing prices)
 * @param {object} client - Database client (for transactions)
 * @param {string} serviceId - Service UUID
 * @param {Array} prices - Array of {currencyCode, price}
 */
export async function setServicePrices(client, serviceId, prices) {
  if (!prices || !Array.isArray(prices) || prices.length === 0) {
    return;
  }

  // Delete existing prices
  await client.query('DELETE FROM service_prices WHERE service_id = $1', [serviceId]);

  // Insert new prices
  for (const p of prices) {
    if (p.currencyCode && p.price != null) {
      await client.query(
        `INSERT INTO service_prices (service_id, currency_code, price) 
         VALUES ($1, $2, $3)
         ON CONFLICT (service_id, currency_code) DO UPDATE SET price = $3, updated_at = NOW()`,
        [serviceId, p.currencyCode.toUpperCase(), parseFloat(p.price)]
      );
    }
  }
}

/**
 * Set prices for a package (replaces all existing prices)
 * @param {object} client - Database client (for transactions)
 * @param {string} packageId - Package UUID
 * @param {Array} prices - Array of {currencyCode, price}
 */
export async function setPackagePrices(client, packageId, prices) {
  if (!prices || !Array.isArray(prices) || prices.length === 0) {
    return;
  }

  // Delete existing prices
  await client.query('DELETE FROM package_prices WHERE package_id = $1', [packageId]);

  // Insert new prices
  for (const p of prices) {
    if (p.currencyCode && p.price != null) {
      await client.query(
        `INSERT INTO package_prices (package_id, currency_code, price) 
         VALUES ($1, $2, $3)
         ON CONFLICT (package_id, currency_code) DO UPDATE SET price = $3, updated_at = NOW()`,
        [packageId, p.currencyCode.toUpperCase(), parseFloat(p.price)]
      );
    }
  }
}

/**
 * Add or update a single price for a service
 * @param {string} serviceId - Service UUID
 * @param {string} currencyCode - Currency code (e.g., 'EUR', 'TRY')
 * @param {number} price - Price amount
 */
export async function upsertServicePrice(serviceId, currencyCode, price) {
  await pool.query(
    `INSERT INTO service_prices (service_id, currency_code, price) 
     VALUES ($1, $2, $3)
     ON CONFLICT (service_id, currency_code) DO UPDATE SET price = $3, updated_at = NOW()`,
    [serviceId, currencyCode.toUpperCase(), parseFloat(price)]
  );
}

/**
 * Add or update a single price for a package
 * @param {string} packageId - Package UUID
 * @param {string} currencyCode - Currency code (e.g., 'EUR', 'TRY')
 * @param {number} price - Price amount
 */
export async function upsertPackagePrice(packageId, currencyCode, price) {
  await pool.query(
    `INSERT INTO package_prices (package_id, currency_code, price) 
     VALUES ($1, $2, $3)
     ON CONFLICT (package_id, currency_code) DO UPDATE SET price = $3, updated_at = NOW()`,
    [packageId, currencyCode.toUpperCase(), parseFloat(price)]
  );
}

/**
 * Get price for a service in a specific currency
 * Falls back to the default price from services table if not found
 * @param {string} serviceId - Service UUID  
 * @param {string} currencyCode - Currency code
 * @returns {object|null} {currencyCode, price} or null
 */
export async function getServicePriceInCurrency(serviceId, currencyCode) {
  const { rows } = await pool.query(
    `SELECT sp.currency_code, sp.price 
     FROM service_prices sp 
     WHERE sp.service_id = $1 AND sp.currency_code = $2`,
    [serviceId, currencyCode.toUpperCase()]
  );
  
  if (rows.length > 0) {
    return {
      currencyCode: rows[0].currency_code,
      price: parseFloat(rows[0].price)
    };
  }
  
  // Fallback to service table price
  const { rows: serviceRows } = await pool.query(
    'SELECT price, currency FROM services WHERE id = $1',
    [serviceId]
  );
  
  if (serviceRows.length > 0 && serviceRows[0].currency === currencyCode.toUpperCase()) {
    return {
      currencyCode: serviceRows[0].currency,
      price: parseFloat(serviceRows[0].price)
    };
  }
  
  return null;
}

/**
 * Get price for a package in a specific currency
 * Falls back to the default price from service_packages table if not found
 * @param {string} packageId - Package UUID  
 * @param {string} currencyCode - Currency code
 * @returns {object|null} {currencyCode, price} or null
 */
export async function getPackagePriceInCurrency(packageId, currencyCode) {
  const { rows } = await pool.query(
    `SELECT pp.currency_code, pp.price 
     FROM package_prices pp 
     WHERE pp.package_id = $1 AND pp.currency_code = $2`,
    [packageId, currencyCode.toUpperCase()]
  );
  
  if (rows.length > 0) {
    return {
      currencyCode: rows[0].currency_code,
      price: parseFloat(rows[0].price)
    };
  }
  
  // Fallback to package table price
  const { rows: packageRows } = await pool.query(
    'SELECT price, currency FROM service_packages WHERE id = $1',
    [packageId]
  );
  
  if (packageRows.length > 0 && packageRows[0].currency === currencyCode.toUpperCase()) {
    return {
      currencyCode: packageRows[0].currency,
      price: parseFloat(packageRows[0].price)
    };
  }
  
  return null;
}

/**
 * Delete all prices for a service
 * @param {string} serviceId - Service UUID
 */
export async function deleteServicePrices(serviceId) {
  await pool.query('DELETE FROM service_prices WHERE service_id = $1', [serviceId]);
}

/**
 * Delete all prices for a package
 * @param {string} packageId - Package UUID
 */
export async function deletePackagePrices(packageId) {
  await pool.query('DELETE FROM package_prices WHERE package_id = $1', [packageId]);
}

/**
 * Sync legacy price/currency column to multi-currency table
 * Useful after updating the main service/package table
 * @param {string} serviceId - Service UUID
 * @param {number} price - Price from services table
 * @param {string} currency - Currency from services table
 */
export async function syncServiceLegacyPrice(serviceId, price, currency) {
  if (price != null && currency) {
    await upsertServicePrice(serviceId, currency, price);
  }
}

/**
 * Sync legacy price/currency column to multi-currency table for packages
 * @param {string} packageId - Package UUID
 * @param {number} price - Price from service_packages table
 * @param {string} currency - Currency from service_packages table
 */
export async function syncPackageLegacyPrice(packageId, price, currency) {
  if (price != null && currency) {
    await upsertPackagePrice(packageId, currency, price);
  }
}

export default {
  getServicePrices,
  getPackagePrices,
  setServicePrices,
  setPackagePrices,
  upsertServicePrice,
  upsertPackagePrice,
  getServicePriceInCurrency,
  getPackagePriceInCurrency,
  deleteServicePrices,
  deletePackagePrices,
  syncServiceLegacyPrice,
  syncPackageLegacyPrice,
};
