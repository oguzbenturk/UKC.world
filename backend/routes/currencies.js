// backend/routes/currencies.js
import express from 'express';
import CurrencyService from '../services/currencyService.js';
import ExchangeRateService from '../services/exchangeRateService.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Trigger manual exchange rate update (Admin only)
router.post('/update-rates', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    await ExchangeRateService.updateRates();
    res.json({ message: 'Exchange rates updated successfully' });
  } catch (error) {
    console.error('Error updating exchange rates:', error);
    res.status(500).json({ error: 'Failed to update exchange rates' });
  }
});

// Get active currencies (public endpoint)
router.get('/active', async (req, res) => {
  try {
    const currencies = await CurrencyService.getActiveCurrencies();
    res.json(currencies);
  } catch (error) {
    console.error('Error fetching active currencies:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// Get all currencies (admin only)
router.get('/', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const currencies = await CurrencyService.getAllCurrencies();
    // Map database column names to frontend-expected property names
    const mappedCurrencies = currencies.map(c => ({
      code: c.currency_code,
      name: c.currency_name,
      symbol: c.symbol,
      exchange_rate: c.exchange_rate,
      base_currency: c.base_currency,
      is_active: c.is_active,
      auto_update_enabled: c.auto_update_enabled,
      update_frequency_hours: c.update_frequency_hours,
      last_updated_at: c.last_updated_at,
      last_update_status: c.last_update_status,
      last_update_source: c.last_update_source
    }));
    res.json(mappedCurrencies);
  } catch (error) {
    console.error('Error fetching currencies:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// Get base currency
router.get('/base', async (req, res) => {
  try {
    const baseCurrency = await CurrencyService.getBaseCurrency();
    res.json(baseCurrency);
  } catch (error) {
    console.error('Error fetching base currency:', error);
    res.status(500).json({ error: 'Failed to fetch base currency' });
  }
});

// Convert currency
router.post('/convert', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const convertedAmount = await CurrencyService.convertCurrency(amount, fromCurrency, toCurrency);
    res.json({ 
      originalAmount: parseFloat(amount),
      convertedAmount,
      fromCurrency,
      toCurrency
    });
  } catch (error) {
    console.error('Error converting currency:', error);
    res.status(500).json({ error: 'Failed to convert currency' });
  }
});

// Add new currency (admin only)
router.post('/', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const currencyData = req.body;
    const newCurrency = await CurrencyService.addCurrency(currencyData);
    res.status(201).json(newCurrency);
  } catch (error) {
    console.error('Error adding currency:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Currency code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to add currency' });
    }
  }
});

// Update exchange rate (admin only)
router.put('/:currencyCode/rate', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { exchangeRate } = req.body;
    
    if (!exchangeRate || exchangeRate <= 0) {
      return res.status(400).json({ error: 'Invalid exchange rate' });
    }
    
    const updatedCurrency = await CurrencyService.updateExchangeRate(currencyCode, exchangeRate);
    res.json(updatedCurrency);
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    res.status(500).json({ error: 'Failed to update exchange rate' });
  }
});

// Toggle currency status (admin only)
router.put('/:currencyCode/toggle', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { isActive } = req.body;
    
    const updatedCurrency = await CurrencyService.toggleCurrencyStatus(currencyCode, isActive);
    res.json(updatedCurrency);
  } catch (error) {
    console.error('Error toggling currency status:', error);
    res.status(500).json({ error: 'Failed to toggle currency status' });
  }
});

// Set base currency (admin only)
router.put('/base/:currencyCode', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const baseCurrency = await CurrencyService.setBaseCurrency(currencyCode);
    res.json(baseCurrency);
  } catch (error) {
    console.error('Error setting base currency:', error);
    res.status(500).json({ error: 'Failed to set base currency' });
  }
});

// Sync rates with TCMB (admin only)
router.post('/sync', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const result = await ExchangeRateService.updateRates();
    if (result.success) {
      res.json({ message: 'Rates updated successfully', updates: result.updates });
    } else {
      res.status(500).json({ error: 'Failed to update rates', details: result.error });
    }
  } catch (error) {
    logger.error('Error syncing rates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// NEW: Auto-Update Management Routes
// ==========================================

// Toggle auto-update for a currency (Admin only)
router.put('/:currencyCode/auto-update', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    const updatedCurrency = await CurrencyService.toggleAutoUpdate(currencyCode, enabled);
    
    if (!updatedCurrency) {
      return res.status(404).json({ error: 'Currency not found' });
    }
    
    res.json({
      message: `Auto-update ${enabled ? 'enabled' : 'disabled'} for ${currencyCode}`,
      currency: updatedCurrency
    });
  } catch (error) {
    logger.error('Error toggling auto-update:', error);
    res.status(500).json({ error: 'Failed to toggle auto-update' });
  }
});

// Set update frequency for a currency (Admin only)
router.put('/:currencyCode/frequency', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const { hours } = req.body;
    
    if (!hours || ![1, 6, 12, 24].includes(hours)) {
      return res.status(400).json({ 
        error: 'Invalid frequency. Must be one of: 1, 6, 12, 24 hours' 
      });
    }
    
    const updatedCurrency = await CurrencyService.setUpdateFrequency(currencyCode, hours);
    
    if (!updatedCurrency) {
      return res.status(404).json({ error: 'Currency not found' });
    }
    
    res.json({
      message: `Update frequency set to ${hours} hours for ${currencyCode}`,
      currency: updatedCurrency
    });
  } catch (error) {
    logger.error('Error setting update frequency:', error);
    res.status(500).json({ error: 'Failed to set update frequency' });
  }
});

// Force refresh rate for a currency (Admin only)
router.post('/:currencyCode/refresh', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode } = req.params;
    const userId = req.user?.id;
    
    const updatedCurrency = await CurrencyService.forceRefreshRate(currencyCode, userId);
    
    res.json({
      message: `Rate refreshed for ${currencyCode}`,
      currency: updatedCurrency
    });
  } catch (error) {
    logger.error('Error refreshing rate:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh rate' });
  }
});

// Get update logs (Admin only)
router.get('/logs', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const { currencyCode, limit = 50, offset = 0 } = req.query;
    
    const logs = await CurrencyService.getUpdateLogs({
      currencyCode,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    
    res.json(logs);
  } catch (error) {
    logger.error('Error fetching update logs:', error);
    res.status(500).json({ error: 'Failed to fetch update logs' });
  }
});

// Get currencies due for update (Admin only - for debugging)
router.get('/due-for-update', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  try {
    const currencies = await CurrencyService.getCurrenciesDueForUpdate();
    res.json(currencies);
  } catch (error) {
    logger.error('Error fetching currencies due for update:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

export default router;
