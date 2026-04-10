// backend/services/currencyService.js
import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

// Rate source URLs
const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const OPEN_ER_API_URL = 'https://open.er-api.com/v6/latest';
const ECB_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR';

// Rate source priorities
const RATE_SOURCES = {
  YAHOO: 'yahoo',
  OPEN_ER: 'open_er',
  FXRATES: 'fxrates',
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
        'SELECT id, currency_code, currency_name, symbol, exchange_rate, base_currency, is_active, auto_update_enabled, update_frequency_hours, last_updated_at, last_update_status, last_update_source, rate_margin_percent FROM currency_settings WHERE is_active = true ORDER BY base_currency DESC, currency_name ASC'
      );
      return rows;
    } catch (error) {
      logger.error('Error fetching active currencies', error);
      throw error;
    }
  }

  /**
   * Get all currencies (active and inactive)
   */
  static async getAllCurrencies() {
    try {
      const { rows } = await pool.query(
        'SELECT id, currency_code, currency_name, symbol, exchange_rate, base_currency, is_active, auto_update_enabled, update_frequency_hours, last_updated_at, last_update_status, last_update_source, rate_margin_percent FROM currency_settings ORDER BY base_currency DESC, currency_name ASC'
      );
      return rows;
    } catch (error) {
      logger.error('Error fetching all currencies', error);
      throw error;
    }
  }

  /**
   * Get base currency
   */
  static async getBaseCurrency() {
    try {
      const { rows } = await pool.query(
        'SELECT id, currency_code, currency_name, symbol, exchange_rate, base_currency, is_active, auto_update_enabled, update_frequency_hours, last_updated_at, last_update_status, last_update_source, rate_margin_percent FROM currency_settings WHERE base_currency = true LIMIT 1'
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Error fetching base currency', error);
      throw error;
    }
  }

  /**
   * Convert amount between currencies
   */
  static async convertCurrency(amount, fromCurrency, toCurrency) {
    try {
      if (fromCurrency === toCurrency) {
        return new Decimal(amount).toDecimalPlaces(2).toNumber();
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
      const baseAmount = new Decimal(amount).div(new Decimal(fromRate[0].exchange_rate));
      const convertedAmount = baseAmount.mul(new Decimal(toRate[0].exchange_rate));

      return convertedAmount.toDecimalPlaces(2).toNumber();
    } catch (error) {
      logger.error('Error converting currency', error);
      throw error;
    }
  }

  /**
   * Convert any currency to TRY (for payment gateway processing)
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code (EUR, USD, GBP, etc.)
   * @returns {Promise<{amount: number, rate: number}>} Converted TRY amount and exchange rate used
   */
  static async convertToTRY(amount, fromCurrency) {
    try {
      const upperCurrency = fromCurrency.toUpperCase();
      const decimalAmount = new Decimal(amount);

      // If already TRY, return as-is
      if (upperCurrency === 'TRY') {
        return {
          amount: decimalAmount.toDecimalPlaces(2).toNumber(),
          rate: 1.0
        };
      }

      // Get TRY exchange rate (relative to base currency EUR)
      const { rows: tryRows } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        ['TRY']
      );

      if (!tryRows.length || !tryRows[0].exchange_rate) {
        throw new Error('TRY exchange rate not found in database');
      }

      const tryRate = new Decimal(tryRows[0].exchange_rate);

      // If source currency is the base currency (EUR), direct multiplication
      // exchange_rate stores "how many of this currency per 1 EUR"
      if (upperCurrency === 'EUR') {
        const convertedAmount = decimalAmount.mul(tryRate);
        return {
          amount: convertedAmount.toDecimalPlaces(2).toNumber(),
          rate: tryRate.toNumber()
        };
      }

      // For non-EUR currencies: first convert to EUR, then to TRY
      // Example: 100 USD ÷ 1.1777 (USD rate) = 84.91 EUR × 51.70 (TRY rate) = 4389 TRY
      const { rows: fromRows } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [upperCurrency]
      );

      if (!fromRows.length || !fromRows[0].exchange_rate) {
        throw new Error(`Exchange rate not found for ${upperCurrency}`);
      }

      const fromRate = new Decimal(fromRows[0].exchange_rate);
      const amountInEUR = decimalAmount.div(fromRate);       // Convert to EUR first
      const convertedAmount = amountInEUR.mul(tryRate);      // Then to TRY
      const effectiveRate = tryRate.div(fromRate);            // Combined rate for audit

      logger.info('convertToTRY via base currency', {
        fromCurrency: upperCurrency,
        originalAmount: decimalAmount.toNumber(),
        fromRate: fromRate.toNumber(),
        amountInEUR: amountInEUR.toDecimalPlaces(2).toNumber(),
        tryRate: tryRate.toNumber(),
        convertedTRY: convertedAmount.toDecimalPlaces(2).toNumber(),
        effectiveRate: effectiveRate.toDecimalPlaces(2).toNumber()
      });

      return {
        amount: convertedAmount.toDecimalPlaces(2).toNumber(),
        rate: effectiveRate.toNumber()
      };
    } catch (error) {
      logger.error('Error converting to TRY:', { amount, fromCurrency, error: error.message });
      throw error;
    }
  }

  /**
   * Get current exchange rate for a currency
   * @param {string} currencyCode - Currency code
   * @returns {Promise<number>} Exchange rate
   */
  static async getExchangeRate(currencyCode) {
    try {
      const { rows } = await pool.query(
        'SELECT exchange_rate FROM currency_settings WHERE currency_code = $1',
        [currencyCode.toUpperCase()]
      );

      if (!rows.length) {
        throw new Error(`Exchange rate not found for ${currencyCode}`);
      }

      return new Decimal(rows[0].exchange_rate).toNumber();
    } catch (error) {
      logger.error('Error getting exchange rate:', { currencyCode, error: error.message });
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
      logger.error('Error updating exchange rate', error);
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
      logger.error('Error adding currency', error);
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
      logger.error('Error toggling currency status', error);
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
      logger.error('Error setting base currency', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Format currency amount for display
   */
  static formatCurrency(amount, currencyCode, symbol = null) {
    const numAmount = new Decimal(amount || 0).toDecimalPlaces(2).toNumber();
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
      return { rate: 1.0, source: RATE_SOURCES.OPEN_ER };
    }

    // Try multiple sources in order of preference
    const sources = [
      // Yahoo Finance — same live forex feed as Google Finance
      {
        name: RATE_SOURCES.YAHOO,
        fetch: async () => {
          const pair = `${baseCurrency}${currencyCode}=X`;
          const response = await fetch(`${YAHOO_FINANCE_URL}/${pair}?interval=1m&range=1m`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error('regularMarketPrice not found in response');
          return price;
        }
      },
      // Open Exchange Rates (hourly updates, free fallback)
      {
        name: RATE_SOURCES.OPEN_ER,
        fetch: async () => {
          const response = await fetch(`${OPEN_ER_API_URL}/${baseCurrency}`);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          if (data.result !== 'success') throw new Error('API returned non-success result');
          return data.rates?.[currencyCode];
        }
      },
      // FXRatesAPI (fallback)
      {
        name: RATE_SOURCES.FXRATES,
        fetch: async () => {
          const response = await fetch(`https://api.fxratesapi.com/latest?base=${baseCurrency}&currencies=${currencyCode}`);
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          return data.rates?.[currencyCode];
        }
      },
      // ExchangeRate-API (last resort)
      {
        name: RATE_SOURCES.ECB,
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
          return { rate: new Decimal(rate).toNumber(), source: source.name };
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
        return new Decimal(rate).toNumber();
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

    // Try primary sources via fetchGoogleRate
    const result = await this.fetchGoogleRate(currencyCode, baseCurrency);
    if (result) {
      return { rate: result.rate, source: result.source, error: null };
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
        rate = new Decimal(rows[0].exchange_rate).toNumber();
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
  static async updateExchangeRateWithAudit(currencyCode, newRate, { source = 'manual', triggeredBy = 'api', userId = null, rawRate = null } = {}) {
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

      // Update the rate (and raw_rate if provided)
      const { rows: updatedRows } = await client.query(
        `UPDATE currency_settings
         SET exchange_rate = $1,
             raw_rate = COALESCE($2, raw_rate),
             last_updated_at = NOW(),
             last_update_status = 'success',
             last_update_source = $3,
             updated_at = NOW()
         WHERE currency_code = $4
         RETURNING *`,
        [newRate, rawRate, source, currencyCode]
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
        SELECT id, currency_code, currency_name, symbol, exchange_rate, base_currency, is_active, auto_update_enabled, update_frequency_hours, last_updated_at, last_update_status, last_update_source, rate_margin_percent FROM currency_settings
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
      const marginPercent = new Decimal(rows[0]?.rate_margin_percent || 0);
      const finalRate = new Decimal(rate).mul(new Decimal(1).add(marginPercent.div(100))).toNumber();
      
      if (marginPercent.gt(0)) {
        logger.info(`Applying ${marginPercent.toNumber()}% margin to ${currencyCode}: ${new Decimal(rate).toFixed(4)} → ${new Decimal(finalRate).toFixed(4)}`);
      }
      
      return await this.updateExchangeRateWithAudit(currencyCode, finalRate, {
        source,
        triggeredBy: 'cron',
        rawRate: rate
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
      const marginPercent = new Decimal(rows[0]?.rate_margin_percent || 0);
      const finalRate = new Decimal(rate).mul(new Decimal(1).add(marginPercent.div(100))).toNumber();
      
      if (marginPercent.gt(0)) {
        logger.info(`Applying ${marginPercent.toNumber()}% margin to ${currencyCode}: ${new Decimal(rate).toFixed(4)} → ${new Decimal(finalRate).toFixed(4)}`);
      }
      
      return await this.updateExchangeRateWithAudit(currencyCode, finalRate, {
        source,
        triggeredBy: 'admin',
        userId,
        rawRate: rate
      });
    }

    throw new Error(`Failed to refresh rate for ${currencyCode}: ${error}`);
  }

  /**
   * Update the rate margin for a currency and recompute exchange_rate from raw_rate
   */
  static async updateRateMargin(currencyCode, marginPercent, userId = null) {
    const { rows } = await pool.query(
      'SELECT raw_rate, exchange_rate FROM currency_settings WHERE currency_code = $1',
      [currencyCode]
    );
    if (!rows[0]) throw new Error(`Currency ${currencyCode} not found`);

    const rawRate = new Decimal(rows[0].raw_rate || rows[0].exchange_rate);
    const newMargin = new Decimal(marginPercent);
    const finalRate = rawRate.mul(new Decimal(1).add(newMargin.div(100))).toDecimalPlaces(4).toNumber();

    await pool.query(
      `UPDATE currency_settings
       SET rate_margin_percent = $1, exchange_rate = $2, updated_at = NOW()
       WHERE currency_code = $3`,
      [newMargin.toNumber(), finalRate, currencyCode]
    );

    await pool.query(
      `INSERT INTO currency_update_logs
       (currency_code, old_rate, new_rate, source, status, triggered_by, triggered_by_user_id)
       VALUES ($1, $2, $3, 'manual', 'success', 'admin', $4)`,
      [currencyCode, rows[0].exchange_rate, finalRate, userId]
    );

    logger.info(`Margin updated for ${currencyCode}: ${newMargin.toNumber()}% → exchange_rate ${finalRate}`);
    return { currencyCode, rawRate: rawRate.toNumber(), marginPercent: newMargin.toNumber(), exchangeRate: finalRate };
  }
}

export default CurrencyService;
