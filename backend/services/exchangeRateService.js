// backend/services/exchangeRateService.js
import axios from 'axios';
import cron from 'node-cron';
import CurrencyService from './currencyService.js';
import { logger } from '../middlewares/errorHandler.js';
import { pool } from '../db.js';

// Track running state
let isRunning = false;
let scheduledTask = null;

class ExchangeRateService {
  /**
   * Start the exchange rate update scheduler
   * Smart scheduling strategy optimized for free tier API limits (~500 updates/month)
   * 
   * Schedule breakdown:
   * - Business hours (9 AM - 7 PM): Every 1 hour = 10 updates/day
   * - Evening (7 PM - 11 PM): Every 2 hours = 2 updates/day
   * - Night (11 PM - 9 AM): Every 4 hours = 2.5 updates/day
   * Total: ~14.5 updates/day × 30 days = ~435 updates/month (within free tier)
   */
  static startScheduler() {
    if (scheduledTask) {
      logger.warn('Exchange Rate Service scheduler already running');
      return;
    }

    logger.info('Initializing Exchange Rate Service with SMART scheduling...');
    
    // Business hours (9 AM - 7 PM Turkey time): Every 1 hour
    // Runs at: 9:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00
    const businessHoursTask = cron.schedule('0 9-18 * * *', async () => {
      try {
        logger.info('🕒 Business hours update triggered');
        await this.updateDueCurrencies();
      } catch (error) {
        logger.error('Scheduled exchange rate update failed (business hours):', error);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul' // Turkey timezone
    });

    // Evening hours (7 PM - 11 PM): Every 2 hours at 19:00 and 21:00
    const eveningTask = cron.schedule('0 19,21 * * *', async () => {
      try {
        logger.info('🌆 Evening update triggered');
        await this.updateDueCurrencies();
      } catch (error) {
        logger.error('Scheduled exchange rate update failed (evening):', error);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });

    // Night hours (11 PM - 9 AM): Every 4 hours at 23:00, 3:00, 7:00
    const nightTask = cron.schedule('0 23,3,7 * * *', async () => {
      try {
        logger.info('🌙 Night update triggered');
        await this.updateDueCurrencies();
      } catch (error) {
        logger.error('Scheduled exchange rate update failed (night):', error);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });

    // Store all tasks for cleanup
    scheduledTask = { businessHoursTask, eveningTask, nightTask };
    
    logger.info('✅ Smart Exchange Rate scheduler active:');
    logger.info('   📊 Business hours (9 AM - 7 PM): Every 1 hour');
    logger.info('   🌆 Evening (7 PM - 11 PM): Every 2 hours');
    logger.info('   🌙 Night (11 PM - 9 AM): Every 4 hours');
    logger.info('   💰 Total: ~14.5 updates/day (~435/month - FREE TIER SAFE)');

    // Also run once on startup after a small delay
    setTimeout(() => {
      this.updateDueCurrencies().catch(err => {
        logger.warn('Initial currency update check failed:', err.message);
      });
    }, 10000); // 10 second delay after server start
  }

  /**
   * Stop the scheduler
   */
  static stopScheduler() {
    if (scheduledTask) {
      // Stop all scheduled tasks
      if (scheduledTask.businessHoursTask) scheduledTask.businessHoursTask.stop();
      if (scheduledTask.eveningTask) scheduledTask.eveningTask.stop();
      if (scheduledTask.nightTask) scheduledTask.nightTask.stop();
      scheduledTask = null;
      logger.info('Exchange Rate Service scheduler stopped (all schedules)');
    }
  }

  /**
   * Check and update currencies that are due for auto-update
   */
  static async updateDueCurrencies() {
    if (isRunning) {
      logger.info('Currency update already in progress, skipping...');
      return { skipped: true };
    }

    isRunning = true;
    const results = {
      checked: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    try {
      logger.info('Checking currencies due for update...');

      // Get currencies that need updating based on their individual settings
      const currenciesDue = await CurrencyService.getCurrenciesDueForUpdate();
      results.checked = currenciesDue.length;

      if (currenciesDue.length === 0) {
        logger.debug('No currencies due for update');
        return results;
      }

      logger.info(`Found ${currenciesDue.length} currencies due for update`);

      // Update each currency
      for (const currency of currenciesDue) {
        try {
          await CurrencyService.autoUpdateCurrency(currency.currency_code);
          results.updated++;
          logger.info(`✓ Auto-updated ${currency.currency_code}`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            currency: currency.currency_code,
            error: error.message
          });
          logger.error(`✗ Failed to update ${currency.currency_code}: ${error.message}`);
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send admin notification if there were failures
      if (results.failed > 0) {
        await this.notifyAdminOfFailures(results);
      }

      logger.info(`Currency update complete: ${results.updated} updated, ${results.failed} failed`);
      return results;

    } catch (error) {
      logger.error('Critical error in currency update:', error);
      throw error;
    } finally {
      isRunning = false;
    }
  }

  /**
   * Update ALL active currencies (legacy method, now calls updateRates internally)
   */
  static async updateRates() {
    logger.info('Starting full exchange rate update...');
    
    try {
      const baseCurrency = await CurrencyService.getBaseCurrency();
      if (!baseCurrency) {
        throw new Error('No base currency defined');
      }

      logger.info(`Fetching rates for base: ${baseCurrency.currency_code}`);

      // Fetch rates from API
      const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${baseCurrency.currency_code}`);
      const data = response.data;
      
      if (!data || !data.rates) {
        throw new Error('Invalid response from exchange rate API');
      }

      const dbCurrencies = await CurrencyService.getAllCurrencies();
      let updates = 0;

      for (const dbCurrency of dbCurrencies) {
        if (dbCurrency.base_currency) continue;
        
        const newRate = data.rates[dbCurrency.currency_code];
        
        if (newRate) {
          const currentRate = parseFloat(dbCurrency.exchange_rate);
          
          if (Math.abs(currentRate - newRate) > 0.0001) {
            // Use the new audit-enabled method
            await CurrencyService.updateExchangeRateWithAudit(
              dbCurrency.currency_code, 
              newRate,
              { source: 'ecb', triggeredBy: 'cron' }
            );
            updates++;
            logger.info(`Updated ${dbCurrency.currency_code} rate to ${newRate}`);
          }
        }
      }
      
      logger.info(`Exchange rate update complete. ${updates} currencies updated.`);
      return { success: true, updates };
      
    } catch (error) {
      logger.error('Failed to update exchange rates:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify admin users when currency updates fail
   */
  static async notifyAdminOfFailures(results) {
    try {
      const { rows: admins } = await pool.query(`
        SELECT u.id, u.email, u.name
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'admin' AND u.email IS NOT NULL
      `);

      if (admins.length === 0) {
        logger.warn('No admin users found for currency update failure notification');
        return;
      }

      const failedCurrencies = results.errors.map(e => e.currency).join(', ');
      const notificationContent = {
        title: 'Currency Update Failed',
        message: `Failed to update exchange rates for: ${failedCurrencies}. Please check manually in Settings → Currency Management.`,
        type: 'warning',
        category: 'system'
      };

      // Try to insert notifications
      try {
        for (const admin of admins) {
          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, category, read, created_at)
            VALUES ($1, $2, $3, $4, $5, false, NOW())
          `, [admin.id, notificationContent.title, notificationContent.message, notificationContent.type, notificationContent.category]);
        }
        logger.info(`Sent currency failure notifications to ${admins.length} admin(s)`);
      } catch (notifError) {
        logger.warn('Could not create admin notifications:', notifError.message);
      }

    } catch (error) {
      logger.error('Error sending admin notifications:', error);
    }
  }

  /**
   * Manually trigger an update for all currencies (admin action)
   */
  static async triggerManualUpdate() {
    return await this.updateRates();
  }
}

export default ExchangeRateService;
