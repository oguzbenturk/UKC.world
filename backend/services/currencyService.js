// backend/services/currencyService.js
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

// Rate source URLs
const GOOGLE_FINANCE_URL = 'https://www.google.com/finance/quote';
const ECB_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR';

// Rate source priorities
const RATE_SOURCES = {
  GOOGLE: 'google',
  ECB: 'ecb',
  MANUAL: 'manual',
  CACHED: 'cached'
};

/**
 * Currency Service for managing multi-currency operations
 * Supports automatic and manual exchange rate updates with full audit trail
 */
class CurrencyService {
  /**
   * Get all active currencies
   */
  static async getActiveCurrencies() {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM currency_settings WHERE is_active = true ORDER BY base_currency DESC, currency_name ASC'
      );
      return rows;
    } catch (error) {
      console.error('Error fetching active currencies:', error);
      throw error;
    }
  }

  /**
   * Get all currencies (active and inactive)
   */
  static async getAllCurrencies() {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM currency_settings ORDER BY base_currency DESC, currency_name ASC'
      );
      return rows;
    } catch (error) {
      console.error('Error fetching all currencies:', error);
      throw error;
    }
  }

  /**
   * Get base currency
   */
  static async getBaseCurrency() {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM currency_settings WHERE base_currency = true LIMIT 1'
      );
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching base currency:', error);
      throw error;
    }
  }

  /**
   * Convert amount between currencies
   */
  static async convertCurrency(amount, fromCurrency, toCurrency) {
    try {
      if (fromCurrency === toCurrency) {
        return parseFloat(amount);
      }

      const { rows: fromRate } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [fromCurrency]
      );

      const { rows: toRate } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [toCurrency]
      );

      if (!fromRate.length || !toRate.length) {
        throw new Error('Currency not found');
      }

      // Convert to base currency first, then to target currency
      const baseAmount = parseFloat(amount) / parseFloat(fromRate[0].exchange_rate);
      const convertedAmount = baseAmount * parseFloat(toRate[0].exchange_rate);

      return Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error('Error converting currency:', error);
      throw error;
    }
  }

  /**
   * Update exchange rate
   */
  static async updateExchangeRate(currencyCode, newRate) {
    try {
      const { rows } = await pool.query(
        'UPDATE currency_settings SET exchange_rate = $1, updated_at = NOW() WHERE currency_code = $2 RETURNING *',
        [newRate, currencyCode]
      );
      return rows[0];
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Add new currency
   */
  static async addCurrency(currencyData) {
    try {
      const { currency_code, currency_name, symbol, exchange_rate, is_active = true } = currencyData;
      
      const { rows } = await pool.query(
        `INSERT INTO currency_settings (currency_code, currency_name, symbol, exchange_rate, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [currency_code, currency_name, symbol, exchange_rate, is_active]
      );
      
      return rows[0];
    } catch (error) {
      console.error('Error adding currency:', error);
      throw error;
    }
  }

  /**
   * Toggle currency active status
   */
  static async toggleCurrencyStatus(currencyCode, isActive) {
    try {
      const { rows } = await pool.query(
        'UPDATE currency_settings SET is_active = $1, updated_at = NOW() WHERE currency_code = $2 RETURNING *',
        [isActive, currencyCode]
      );
      return rows[0];
    } catch (error) {
      console.error('Error toggling currency status:', error);
      throw error;
    }
  }

  /**
   * Set base currency
   */
  static async setBaseCurrency(currencyCode) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Remove base currency from all currencies
      await client.query('UPDATE currency_settings SET base_currency = false');
      
      // Set new base currency
      const { rows } = await client.query(
        'UPDATE currency_settings SET base_currency = true, exchange_rate = 1.0000, updated_at = NOW() WHERE currency_code = $1 RETURNING *',
        [currencyCode]
      );
      
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error setting base currency:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Format currency amount for display
   */
  static formatCurrency(amount, currencyCode, symbol = null) {
    const numAmount = parseFloat(amount) || 0;
    const formattedAmount = numAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    if (symbol) {
      return `${symbol}${formattedAmount}`;
    }
    
    // Return with currency code if no symbol provided
    return `${formattedAmount} ${currencyCode}`;
  }

  /**
   * Get currency symbol by code
   */
  static async getCurrencySymbol(currencyCode) {
    try {
      const { rows } = await pool.query(
        'SELECT symbol FROM currency_settings WHERE currency_code = $1',
        [currencyCode]
      );
      return rows[0]?.symbol || currencyCode;
    } catch (error) {
      logger.error('Error fetching currency symbol:', error);
      return currencyCode;
    }
  }

  // ==========================================
  // EXCHANGE RATE FETCHERS (Tasks 6-8)
  // ==========================================

  /**
   * Fetch rate from Google Finance (scraping approach)
   * Enhanced with multiple API fallbacks for better accuracy
   */
  static async fetchGoogleRate(currencyCode, baseCurrency = 'EUR') {
    // Optimization: If fetching base currency rate (e.g. EUR -> EUR), always return 1
    if (currencyCode === baseCurrency) {
      return 1.0;
    }

    // Try multiple sources in order of preference
    const sources = [
      // Frankfurter (ECB-based, very reliable and matches Google closely)
      {
        name: 'frankfurter',
        fetch: async () => {
          const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}&to=${currencyCode}`);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          return data.rates?.[currencyCode];
        }
      },
      // FXRatesAPI (Commercial accuracy)
      {
        name: 'fxratesapi',
        fetch: async () => {
          const response = await fetch(`https://api.fxratesapi.com/latest?base=${baseCurrency}&currencies=${currencyCode}`);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          return data.rates?.[currencyCode];
        }
      },
      // ExchangeRate-API (Fast, reliable)
      {
        name: 'exchangerate-api',
        fetch: async () => {
          const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          return data.rates?.[currencyCode];
        }
      }
    ];

    // Try each source until one succeeds
    for (const source of sources) {
      try {
        const rate = await source.fetch();
        if (rate && !isNaN(rate)) {
          logger.debug(`Successfully fetched ${currencyCode} rate from ${source.name}: ${rate}`);
          return parseFloat(rate);
        }
      } catch (error) {
        logger.warn(`${source.name} fetch failed for ${currencyCode}: ${error.message}`);
      }
    }

    // If all sources fail, return null
    logger.warn(`All sources failed for ${currencyCode}`);
    return null;
  }

  /**
   * Fetch rate from ECB via exchangerate-api (fallback)
   */
  static async fetchECBRate(currencyCode, baseCurrency = 'EUR') {
    try {
      const response = await fetch(ECB_API_URL);
      if (!response.ok) {
        throw new Error(`ECB API returned ${response.status}`);
      }
      
      const data = await response.json();
      const rate = data.rates?.[currencyCode];
      
      if (rate) {
        return parseFloat(rate);
      }
      
      throw new Error(`Currency ${currencyCode} not found in ECB response`);
    } catch (error) {
      logger.warn(`ECB API fetch failed for ${currencyCode}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch rate with fallback chain: Google → ECB → Cached
   */
  static async fetchRateWithFallback(currencyCode, baseCurrency = 'EUR') {
    let rate = null;
    let source = null;
    let error = null;

    // Try Google first
    rate = await this.fetchGoogleRate(currencyCode, baseCurrency);
    if (rate) {
      source = RATE_SOURCES.GOOGLE;
      return { rate, source, error: null };
    }

    // Fallback to ECB
    rate = await this.fetchECBRate(currencyCode, baseCurrency);
    if (rate) {
      source = RATE_SOURCES.ECB;
      return { rate, source, error: null };
    }

    // Final fallback: use cached rate from DB
    try {
      const { rows } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [currencyCode]
      );
      if (rows[0]?.exchange_rate) {
        rate = parseFloat(rows[0].exchange_rate);
        source = RATE_SOURCES.CACHED;
        error = 'Using cached rate - all external sources failed';
        return { rate, source, error };
      }
    } catch (dbError) {
      logger.error('Failed to get cached rate:', dbError);
    }

    return { rate: null, source: null, error: 'All rate sources failed' };
  }

  // ==========================================
  // AUTO-UPDATE METHODS (Tasks 9-12)
  // ==========================================

  /**
   * Update exchange rate with full audit logging
   */
  static async updateExchangeRateWithAudit(currencyCode, newRate, { source = 'manual', triggeredBy = 'api', userId = null } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current rate
      const { rows: currentRows } = await client.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [currencyCode]
      );
      const oldRate = currentRows[0]?.exchange_rate || null;
      const rateChangePercent = oldRate ? ((newRate - oldRate) / oldRate * 100) : null;

      // Update the rate
      const { rows: updatedRows } = await client.query(
        `UPDATE currency_settings 
         SET exchange_rate = $1, 
             last_updated_at = NOW(), 
             last_update_status = 'success',
             last_update_source = $2,
             updated_at = NOW()
         WHERE currency_code = $3 
         RETURNING *`,
        [newRate, source, currencyCode]
      );

      // Log the update
      await client.query(
        `INSERT INTO currency_update_logs 
         (currency_code, old_rate, new_rate, rate_change_percent, source, status, triggered_by, triggered_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'success', $6, $7)`,
        [currencyCode, oldRate, newRate, rateChangePercent, source, triggeredBy, userId]
      );

      await client.query('COMMIT');
      
      logger.info(`Exchange rate updated: ${currencyCode} ${oldRate} → ${newRate} (${source})`);
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Log the failure
      try {
        await pool.query(
          `INSERT INTO currency_update_logs 
           (currency_code, old_rate, new_rate, source, status, error_message, triggered_by, triggered_by_user_id)
           VALUES ($1, NULL, $2, $3, 'failed', $4, $5, $6)`,
          [currencyCode, newRate, source, error.message, triggeredBy, userId]
        );
      } catch (logError) {
        logger.error('Failed to log rate update failure:', logError);
      }

      logger.error('Error updating exchange rate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Toggle auto-update for a currency
   */
  static async toggleAutoUpdate(currencyCode, enabled) {
    try {
      const { rows } = await pool.query(
        `UPDATE currency_settings 
         SET auto_update_enabled = $1, updated_at = NOW()
         WHERE currency_code = $2 
         RETURNING *`,
        [enabled, currencyCode]
      );
      
      logger.info(`Auto-update ${enabled ? 'enabled' : 'disabled'} for ${currencyCode}`);
      return rows[0];
    } catch (error) {
      logger.error('Error toggling auto-update:', error);
      throw error;
    }
  }

  /**
   * Set update frequency for a currency
   */
  static async setUpdateFrequency(currencyCode, hours) {
    try {
      const validHours = [1, 6, 12, 24];
      if (!validHours.includes(hours)) {
        throw new Error(`Invalid frequency. Must be one of: ${validHours.join(', ')}`);
      }

      const { rows } = await pool.query(
        `UPDATE currency_settings 
         SET update_frequency_hours = $1, updated_at = NOW()
         WHERE currency_code = $2 
         RETURNING *`,
        [hours, currencyCode]
      );
      
      logger.info(`Update frequency set to ${hours}h for ${currencyCode}`);
      return rows[0];
    } catch (error) {
      logger.error('Error setting update frequency:', error);
      throw error;
    }
  }

  /**
   * Get update logs for admin UI
   */
  static async getUpdateLogs({ currencyCode = null, limit = 50, offset = 0 } = {}) {
    try {
      let query = `
        SELECT l.*, u.name as triggered_by_user_name
        FROM currency_update_logs l
        LEFT JOIN users u ON l.triggered_by_user_id = u.id
      `;
      const params = [];
      
      if (currencyCode) {
        query += ' WHERE l.currency_code = $1';
        params.push(currencyCode);
      }
      
      query += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);
      return rows;
    } catch (error) {
      logger.error('Error fetching update logs:', error);
      throw error;
    }
  }

  /**
   * Get currencies that need auto-update
   */
  static async getCurrenciesDueForUpdate() {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM currency_settings 
        WHERE auto_update_enabled = true 
          AND base_currency = false
          AND (
            last_updated_at IS NULL 
            OR last_updated_at < NOW() - (update_frequency_hours || ' hours')::INTERVAL
          )
        ORDER BY last_updated_at ASC NULLS FIRST
      `);
      return rows;
    } catch (error) {
      logger.error('Error fetching currencies due for update:', error);
      throw error;
    }
  }

  /**
   * Auto-update a single currency rate
   */
  static async autoUpdateCurrency(currencyCode) {
    const { rate, source, error } = await this.fetchRateWithFallback(currencyCode);
    
    if (rate) {
      // Get margin percentage and apply it
      const { rows } = await pool.query(
        'SELECT rate_margin_percent FROM currency_settings WHERE currency_code = $1',
        [currencyCode]
      );
      const marginPercent = parseFloat(rows[0]?.rate_margin_percent || 0);
      const finalRate = rate * (1 + marginPercent / 100);
      
      if (marginPercent > 0) {
        logger.info(`Applying ${marginPercent}% margin to ${currencyCode}: ${rate.toFixed(4)} → ${finalRate.toFixed(4)}`);
      }
      
      return await this.updateExchangeRateWithAudit(currencyCode, finalRate, {
        source,
        triggeredBy: 'cron'
      });
    }

    // Log failure
    await pool.query(
      `UPDATE currency_settings 
       SET last_update_status = 'failed', last_updated_at = NOW()
       WHERE currency_code = $1`,
      [currencyCode]
    );

    await pool.query(
      `INSERT INTO currency_update_logs 
       (currency_code, source, status, error_message, triggered_by)
       VALUES ($1, 'auto', 'failed', $2, 'cron')`,
      [currencyCode, error || 'Unknown error']
    );

    throw new Error(`Failed to auto-update ${currencyCode}: ${error}`);
  }

  /**
   * Force refresh rate for a currency (admin action)
   */
  static async forceRefreshRate(currencyCode, userId = null) {
    const { rate, source, error } = await this.fetchRateWithFallback(currencyCode);
    
    if (rate) {
      // Get margin percentage and apply it
      const { rows } = await pool.query(
        'SELECT rate_margin_percent FROM currency_settings WHERE currency_code = $1',
        [currencyCode]
      );
      const marginPercent = parseFloat(rows[0]?.rate_margin_percent || 0);
      const finalRate = rate * (1 + marginPercent / 100);
      
      if (marginPercent > 0) {
        logger.info(`Applying ${marginPercent}% margin to ${currencyCode}: ${rate.toFixed(4)} → ${finalRate.toFixed(4)}`);
      }
      
      return await this.updateExchangeRateWithAudit(currencyCode, finalRate, {
        source,
        triggeredBy: 'admin',
        userId
      });
    }

    throw new Error(`Failed to refresh rate for ${currencyCode}: ${error}`);
  }
}

export default CurrencyService;
