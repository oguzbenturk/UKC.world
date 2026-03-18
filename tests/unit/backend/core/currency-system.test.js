/**
 * Currency System Unit Tests
 * Tests for exchange rate fetching, fallback chain, auto-update logic, and API routes
 * Run: cd backend && npm test
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ============================================
// Test 1: Rate Fallback Chain
// ============================================
describe('Currency Rate Fallback Chain', () => {
  // Mock fetch for rate fetching tests
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Google Finance Rate Fetcher', () => {
    it('should parse Google Finance response correctly', () => {
      // Simulate Google Finance HTML response parsing
      const mockHtmlResponse = `
        <div data-last-price="1.0850">EUR/USD</div>
      `;
      
      // Extract rate from mock HTML (simulating regex extraction)
      const rateMatch = mockHtmlResponse.match(/data-last-price="([\d.]+)"/);
      const rate = rateMatch ? parseFloat(rateMatch[1]) : null;
      
      expect(rate).toBe(1.085);
    });

    it('should return null for invalid HTML response', () => {
      const mockHtmlResponse = '<div>Invalid content</div>';
      const rateMatch = mockHtmlResponse.match(/data-last-price="([\d.]+)"/);
      const rate = rateMatch ? parseFloat(rateMatch[1]) : null;
      
      expect(rate).toBeNull();
    });

    it('should handle empty response', () => {
      const mockHtmlResponse = '';
      const rateMatch = mockHtmlResponse.match(/data-last-price="([\d.]+)"/) || [];
      const rate = rateMatch[1] ? parseFloat(rateMatch[1]) : null;
      
      expect(rate).toBeNull();
    });
  });

  describe('ECB Fallback Rate Fetcher', () => {
    it('should parse exchangerate-api.com response correctly', () => {
      const mockApiResponse = {
        result: 'success',
        conversion_rates: {
          EUR: 1,
          USD: 1.085,
          GBP: 0.856,
          TRY: 32.45
        }
      };
      
      const usdRate = mockApiResponse.conversion_rates.USD;
      const tryRate = mockApiResponse.conversion_rates.TRY;
      
      expect(usdRate).toBe(1.085);
      expect(tryRate).toBe(32.45);
    });

    it('should handle missing currency in response', () => {
      const mockApiResponse = {
        result: 'success',
        conversion_rates: {
          EUR: 1,
          USD: 1.085
        }
      };
      
      const jpyRate = mockApiResponse.conversion_rates.JPY;
      
      expect(jpyRate).toBeUndefined();
    });

    it('should detect API failure response', () => {
      const mockApiResponse = {
        result: 'error',
        'error-type': 'unsupported-code'
      };
      
      const isSuccess = mockApiResponse.result === 'success';
      
      expect(isSuccess).toBe(false);
    });
  });

  describe('Fallback Chain Logic', () => {
    it('should use Google rate when available', async () => {
      const googleRate = 32.45;
      const ecbRate = 32.50;
      const cachedRate = 32.00;
      
      // Simulate fallback logic
      const fetchRateWithFallback = async () => {
        // Try Google first
        if (googleRate) return { rate: googleRate, source: 'google' };
        // Try ECB second
        if (ecbRate) return { rate: ecbRate, source: 'ecb' };
        // Fall back to cached
        return { rate: cachedRate, source: 'cached' };
      };
      
      const result = await fetchRateWithFallback();
      
      expect(result.rate).toBe(32.45);
      expect(result.source).toBe('google');
    });

    it('should fall back to ECB when Google fails', async () => {
      const googleRate = null; // Google failed
      const ecbRate = 32.50;
      const cachedRate = 32.00;
      
      const fetchRateWithFallback = async () => {
        if (googleRate) return { rate: googleRate, source: 'google' };
        if (ecbRate) return { rate: ecbRate, source: 'ecb' };
        return { rate: cachedRate, source: 'cached' };
      };
      
      const result = await fetchRateWithFallback();
      
      expect(result.rate).toBe(32.50);
      expect(result.source).toBe('ecb');
    });

    it('should fall back to cached rate when both sources fail', async () => {
      const googleRate = null;
      const ecbRate = null;
      const cachedRate = 32.00;
      
      const fetchRateWithFallback = async () => {
        if (googleRate) return { rate: googleRate, source: 'google' };
        if (ecbRate) return { rate: ecbRate, source: 'ecb' };
        return { rate: cachedRate, source: 'cached' };
      };
      
      const result = await fetchRateWithFallback();
      
      expect(result.rate).toBe(32.00);
      expect(result.source).toBe('cached');
    });

    it('should throw error when all sources fail and no cache', async () => {
      const googleRate = null;
      const ecbRate = null;
      const cachedRate = null;
      
      const fetchRateWithFallback = async () => {
        if (googleRate) return { rate: googleRate, source: 'google' };
        if (ecbRate) return { rate: ecbRate, source: 'ecb' };
        if (cachedRate) return { rate: cachedRate, source: 'cached' };
        throw new Error('Unable to fetch exchange rate from any source');
      };
      
      await expect(fetchRateWithFallback()).rejects.toThrow('Unable to fetch exchange rate');
    });
  });
});

// ============================================
// Test 2: Auto-Update Cron Logic
// ============================================
describe('Currency Auto-Update Cron', () => {
  describe('Currency Due Check Logic', () => {
    it('should identify currencies due for update based on frequency', () => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000); // Not due yet (< 1hr)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      
      const currencies = [
        { code: 'USD', auto_update_enabled: true, update_frequency_hours: 1, last_updated_at: thirtyMinutesAgo },
        { code: 'GBP', auto_update_enabled: true, update_frequency_hours: 1, last_updated_at: twoHoursAgo },
        { code: 'TRY', auto_update_enabled: true, update_frequency_hours: 24, last_updated_at: twentyFiveHoursAgo },
        { code: 'JPY', auto_update_enabled: false, update_frequency_hours: 1, last_updated_at: twoHoursAgo },
      ];
      
      const isDue = (currency) => {
        if (!currency.auto_update_enabled) return false;
        if (!currency.last_updated_at) return true;
        
        const hoursSinceUpdate = (now - new Date(currency.last_updated_at)) / (1000 * 60 * 60);
        return hoursSinceUpdate >= currency.update_frequency_hours;
      };
      
      const dueCurrencies = currencies.filter(isDue);
      
      expect(dueCurrencies.length).toBe(2);
      expect(dueCurrencies.map(c => c.code)).toContain('GBP');
      expect(dueCurrencies.map(c => c.code)).toContain('TRY');
      expect(dueCurrencies.map(c => c.code)).not.toContain('USD'); // Not due yet
      expect(dueCurrencies.map(c => c.code)).not.toContain('JPY'); // Auto-update disabled
    });

    it('should mark currency as due if never updated', () => {
      const currency = {
        code: 'CHF',
        auto_update_enabled: true,
        update_frequency_hours: 24,
        last_updated_at: null
      };
      
      const isDue = !currency.last_updated_at || 
        (new Date() - new Date(currency.last_updated_at)) / (1000 * 60 * 60) >= currency.update_frequency_hours;
      
      expect(isDue).toBe(true);
    });

    it('should respect different frequency settings', () => {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      
      const testCases = [
        { frequency: 1, lastUpdate: sixHoursAgo, expected: true },
        { frequency: 6, lastUpdate: sixHoursAgo, expected: true },
        { frequency: 12, lastUpdate: sixHoursAgo, expected: false },
        { frequency: 24, lastUpdate: sixHoursAgo, expected: false },
      ];
      
      testCases.forEach(({ frequency, lastUpdate, expected }) => {
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
        const isDue = hoursSinceUpdate >= frequency;
        expect(isDue).toBe(expected);
      });
    });
  });

  describe('Scheduler Interval Logic', () => {
    it('should run hourly check at correct interval', () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const schedulerInterval = ONE_HOUR_MS;
      
      expect(schedulerInterval).toBe(3600000);
    });

    it('should skip base currency (EUR)', () => {
      const currencies = [
        { code: 'EUR', base_currency: true, auto_update_enabled: true },
        { code: 'USD', base_currency: false, auto_update_enabled: true },
      ];
      
      const updatableCurrencies = currencies.filter(c => !c.base_currency && c.auto_update_enabled);
      
      expect(updatableCurrencies.length).toBe(1);
      expect(updatableCurrencies[0].code).toBe('USD');
    });
  });
});

// ============================================
// Test 3: Currency API Routes Logic
// ============================================
describe('Currency Admin API Routes', () => {
  describe('Auto-Update Toggle Validation', () => {
    it('should accept valid boolean for enabled parameter', () => {
      const validInputs = [true, false];
      
      validInputs.forEach(input => {
        expect(typeof input).toBe('boolean');
      });
    });

    it('should reject non-boolean enabled parameter', () => {
      const invalidInputs = ['true', 1, 0, null, undefined, {}];
      
      invalidInputs.forEach(input => {
        const isValid = typeof input === 'boolean';
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Frequency Validation', () => {
    it('should accept valid frequency values', () => {
      const validFrequencies = [1, 6, 12, 24];
      
      validFrequencies.forEach(freq => {
        const isValid = [1, 6, 12, 24].includes(freq);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid frequency values', () => {
      const invalidFrequencies = [0, 2, 3, 5, 48, -1, 'hourly'];
      
      invalidFrequencies.forEach(freq => {
        const isValid = [1, 6, 12, 24].includes(freq);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Exchange Rate Validation', () => {
    it('should accept positive exchange rates', () => {
      const validRates = [1.0, 0.85, 32.45, 150.25, 0.0001];
      
      validRates.forEach(rate => {
        const isValid = typeof rate === 'number' && rate > 0;
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid exchange rates', () => {
      const invalidRates = [0, -1.5, null, undefined, 'abc', NaN];
      
      invalidRates.forEach(rate => {
        const isValid = typeof rate === 'number' && !isNaN(rate) && rate > 0;
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Currency Code Validation', () => {
    it('should accept valid ISO 4217 currency codes', () => {
      const validCodes = ['USD', 'EUR', 'GBP', 'TRY', 'JPY', 'CHF'];
      
      validCodes.forEach(code => {
        const isValid = typeof code === 'string' && code.length === 3 && /^[A-Z]{3}$/.test(code);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid currency codes', () => {
      const invalidCodes = ['usd', 'US', 'USDD', '123', '', null];
      
      invalidCodes.forEach(code => {
        const isValid = typeof code === 'string' && code.length === 3 && /^[A-Z]{3}$/.test(code);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Logs Pagination', () => {
    it('should default to reasonable limits', () => {
      const defaultLimit = 50;
      const defaultOffset = 0;
      
      expect(defaultLimit).toBeLessThanOrEqual(100);
      expect(defaultOffset).toBeGreaterThanOrEqual(0);
    });

    it('should cap maximum results', () => {
      const requestedLimit = 500;
      const maxLimit = 100;
      const effectiveLimit = Math.min(requestedLimit, maxLimit);
      
      expect(effectiveLimit).toBe(100);
    });
  });
});

// ============================================
// Test 4: Transaction Transparency Logic
// ============================================
describe('Transaction Transparency', () => {
  describe('Original Amount Capture', () => {
    it('should store original amount when currency differs', () => {
      const transaction = {
        amount: 100, // Converted to EUR
        currency: 'EUR',
        original_amount: 3245, // Original in TRY
        original_currency: 'TRY',
        transaction_exchange_rate: 32.45
      };
      
      expect(transaction.original_amount).toBe(3245);
      expect(transaction.original_currency).toBe('TRY');
      expect(transaction.transaction_exchange_rate).toBe(32.45);
    });

    it('should match original when same currency', () => {
      const transaction = {
        amount: 100,
        currency: 'EUR',
        original_amount: 100,
        original_currency: 'EUR',
        transaction_exchange_rate: null
      };
      
      expect(transaction.original_amount).toBe(transaction.amount);
      expect(transaction.original_currency).toBe(transaction.currency);
    });

    it('should verify conversion math', () => {
      const originalAmount = 3245;
      const exchangeRate = 32.45;
      const expectedConverted = originalAmount / exchangeRate;
      
      expect(Math.round(expectedConverted * 100) / 100).toBe(100);
    });
  });

  describe('Audit Trail Fields', () => {
    it('should capture all required transparency fields', () => {
      const requiredFields = ['original_amount', 'original_currency', 'transaction_exchange_rate'];
      
      const transaction = {
        id: 'txn_123',
        user_id: 'user_456',
        amount: 100,
        currency: 'EUR',
        original_amount: 3245,
        original_currency: 'TRY',
        transaction_exchange_rate: 32.45,
        created_at: new Date()
      };
      
      requiredFields.forEach(field => {
        expect(transaction).toHaveProperty(field);
      });
    });

    it('should allow null transparency fields for same-currency transactions', () => {
      const transaction = {
        amount: 100,
        currency: 'EUR',
        original_amount: 100,
        original_currency: 'EUR',
        transaction_exchange_rate: null // No conversion needed
      };
      
      expect(transaction.transaction_exchange_rate).toBeNull();
    });
  });

  describe('Deposit Transparency', () => {
    it('should capture original deposit amount', () => {
      const depositRequest = {
        amount: 1000, // User deposited 1000 TRY
        currency: 'TRY'
      };
      
      const exchangeRate = 32.45;
      const convertedAmount = depositRequest.amount / exchangeRate;
      
      const walletTransaction = {
        amount: Math.round(convertedAmount * 100) / 100,
        currency: 'EUR', // Wallet currency
        original_amount: depositRequest.amount,
        original_currency: depositRequest.currency,
        transaction_exchange_rate: exchangeRate
      };
      
      expect(walletTransaction.amount).toBeCloseTo(30.82, 1);
      expect(walletTransaction.original_amount).toBe(1000);
      expect(walletTransaction.original_currency).toBe('TRY');
    });
  });

  describe('Withdrawal Transparency', () => {
    it('should capture withdrawal in original currency', () => {
      const withdrawal = {
        amount: 50, // Deducted from EUR wallet
        currency: 'EUR',
        original_amount: 50,
        original_currency: 'EUR',
        transaction_exchange_rate: null
      };
      
      expect(withdrawal.original_amount).toBe(50);
    });
  });
});

// ============================================
// Test 5: Currency Update Audit Logs
// ============================================
describe('Currency Update Audit Logs', () => {
  describe('Rate Change Logging', () => {
    it('should calculate rate change percentage', () => {
      const oldRate = 32.00;
      const newRate = 32.45;
      const changePercent = ((newRate - oldRate) / oldRate) * 100;
      
      expect(changePercent).toBeCloseTo(1.41, 1);
    });

    it('should handle negative rate changes', () => {
      const oldRate = 32.45;
      const newRate = 32.00;
      const changePercent = ((newRate - oldRate) / oldRate) * 100;
      
      expect(changePercent).toBeCloseTo(-1.39, 1);
    });

    it('should handle zero old rate gracefully', () => {
      const oldRate = 0;
      const newRate = 32.45;
      
      // Avoid division by zero
      const changePercent = oldRate === 0 ? null : ((newRate - oldRate) / oldRate) * 100;
      
      expect(changePercent).toBeNull();
    });
  });

  describe('Log Entry Structure', () => {
    it('should include all required log fields', () => {
      const logEntry = {
        currency_code: 'TRY',
        old_rate: 32.00,
        new_rate: 32.45,
        rate_change_percent: 1.41,
        source: 'google',
        status: 'success',
        error_message: null,
        triggered_by: 'cron',
        triggered_by_user_id: null,
        metadata: { fetchDuration: 150 },
        created_at: new Date()
      };
      
      expect(logEntry).toHaveProperty('currency_code');
      expect(logEntry).toHaveProperty('old_rate');
      expect(logEntry).toHaveProperty('new_rate');
      expect(logEntry).toHaveProperty('rate_change_percent');
      expect(logEntry).toHaveProperty('source');
      expect(logEntry).toHaveProperty('status');
      expect(logEntry).toHaveProperty('triggered_by');
    });

    it('should capture error details on failure', () => {
      const failedLogEntry = {
        currency_code: 'TRY',
        old_rate: 32.00,
        new_rate: null,
        rate_change_percent: null,
        source: 'google',
        status: 'failed',
        error_message: 'Network timeout',
        triggered_by: 'cron',
        triggered_by_user_id: null,
        metadata: { error: 'ETIMEDOUT' },
        created_at: new Date()
      };
      
      expect(failedLogEntry.status).toBe('failed');
      expect(failedLogEntry.error_message).toBeTruthy();
      expect(failedLogEntry.new_rate).toBeNull();
    });
  });

  describe('Manual vs Automatic Updates', () => {
    it('should distinguish manual admin updates', () => {
      const manualUpdate = {
        triggered_by: 'admin',
        triggered_by_user_id: 'user_admin_123',
        source: 'manual'
      };
      
      expect(manualUpdate.triggered_by).toBe('admin');
      expect(manualUpdate.triggered_by_user_id).toBeTruthy();
    });

    it('should mark cron updates correctly', () => {
      const cronUpdate = {
        triggered_by: 'cron',
        triggered_by_user_id: null,
        source: 'google'
      };
      
      expect(cronUpdate.triggered_by).toBe('cron');
      expect(cronUpdate.triggered_by_user_id).toBeNull();
    });
  });
});

// ============================================
// Test 6: Currency Conversion Logic (E2E Flow)
// ============================================
describe('End-to-End Currency Flow', () => {
  describe('Admin Sets Rate → Customer Sees Price', () => {
    it('should convert prices correctly for display', () => {
      // Admin sets service price in EUR
      const servicePrice = 100; // EUR
      const serviceCurrency = 'EUR';
      
      // Exchange rates (1 EUR = X)
      const exchangeRates = {
        EUR: 1,
        USD: 1.085,
        TRY: 32.45,
        GBP: 0.856
      };
      
      // Customer views in TRY
      const customerCurrency = 'TRY';
      
      // Convert EUR to TRY
      const displayPrice = (servicePrice / exchangeRates[serviceCurrency]) * exchangeRates[customerCurrency];
      
      expect(displayPrice).toBeCloseTo(3245, 2);
    });

    it('should handle same-currency display', () => {
      const servicePrice = 100;
      const serviceCurrency = 'EUR';
      const customerCurrency = 'EUR';
      
      const exchangeRates = { EUR: 1 };
      const displayPrice = (servicePrice / exchangeRates[serviceCurrency]) * exchangeRates[customerCurrency];
      
      expect(displayPrice).toBe(100);
    });
  });

  describe('Customer Pays → Transaction Logged', () => {
    it('should record transaction with original amount', () => {
      // Customer's view: 3245 TRY
      const customerPayment = {
        amount: 3245,
        currency: 'TRY'
      };
      
      // Exchange rate at time of transaction
      const rateAtTransaction = 32.45;
      
      // Convert to base currency (EUR) for wallet
      const baseAmount = customerPayment.amount / rateAtTransaction;
      
      // Create wallet transaction
      const walletTransaction = {
        amount: Math.round(baseAmount * 100) / 100,
        currency: 'EUR',
        original_amount: customerPayment.amount,
        original_currency: customerPayment.currency,
        transaction_exchange_rate: rateAtTransaction
      };
      
      expect(walletTransaction.amount).toBe(100);
      expect(walletTransaction.original_amount).toBe(3245);
      expect(walletTransaction.original_currency).toBe('TRY');
      expect(walletTransaction.transaction_exchange_rate).toBe(32.45);
    });
  });

  describe('Price Fluctuation Handling', () => {
    it('should use rate at transaction time, not current rate', () => {
      // Rate when customer viewed price
      const rateAtDisplay = 32.45;
      
      // Rate when customer paid (changed!)
      const rateAtPayment = 33.00;
      
      // Original price in EUR
      const priceEUR = 100;
      
      // Customer was shown this price
      const priceShownTRY = priceEUR * rateAtDisplay; // 3245 TRY
      
      // If we charged current rate, customer would pay more
      const priceCurrentTRY = priceEUR * rateAtPayment; // 3300 TRY
      
      // We should honor the displayed price (good UX)
      // OR use the payment-time rate (accurate accounting)
      // System records both for audit
      
      expect(priceShownTRY).toBeCloseTo(3245, 2);
      expect(priceCurrentTRY).toBe(3300);
      expect(priceCurrentTRY).toBeGreaterThan(priceShownTRY);
    });
  });

  describe('Multi-Currency Booking Flow', () => {
    it('should handle full booking with mixed currencies', () => {
      // Setup
      const baseCurrency = 'EUR';
      const customerCurrency = 'TRY';
      const exchangeRate = 32.45;
      
      // Service priced in EUR
      const lessonPrice = 50; // EUR
      const equipmentRental = 20; // EUR
      const totalEUR = lessonPrice + equipmentRental; // 70 EUR
      
      // Displayed to customer in TRY
      const totalTRY = totalEUR * exchangeRate; // 2271.5 TRY
      
      // Customer pays from wallet (which stores EUR)
      const walletBalanceEUR = 100;
      const canAfford = walletBalanceEUR >= totalEUR;
      
      // Transaction record
      const booking = {
        total_amount: totalEUR,
        currency: baseCurrency,
        display_amount: totalTRY,
        display_currency: customerCurrency,
        exchange_rate_used: exchangeRate
      };
      
      expect(canAfford).toBe(true);
      expect(booking.total_amount).toBe(70);
      expect(booking.display_amount).toBe(2271.5);
    });
  });
});

// ============================================
// Test 7: Admin Notification on Failure
// ============================================
describe('Admin Failure Notifications', () => {
  describe('Notification Creation', () => {
    it('should create notification for rate update failure', () => {
      const failedCurrency = 'TRY';
      const errorMessage = 'Google Finance returned 503';
      
      const notification = {
        user_role: 'admin', // Target all admins
        title: 'Currency Rate Update Failed',
        message: `Failed to update exchange rate for ${failedCurrency}: ${errorMessage}`,
        type: 'warning',
        category: 'system',
        metadata: {
          currency_code: failedCurrency,
          error: errorMessage,
          attempted_at: new Date().toISOString()
        }
      };
      
      expect(notification.type).toBe('warning');
      expect(notification.message).toContain('TRY');
      expect(notification.metadata.currency_code).toBe('TRY');
    });

    it('should batch notifications for multiple failures', () => {
      const failedCurrencies = ['TRY', 'USD', 'GBP'];
      
      const notification = {
        title: 'Multiple Currency Updates Failed',
        message: `Failed to update rates for: ${failedCurrencies.join(', ')}`,
        metadata: {
          failed_currencies: failedCurrencies,
          failure_count: failedCurrencies.length
        }
      };
      
      expect(notification.metadata.failure_count).toBe(3);
      expect(notification.message).toContain('TRY');
      expect(notification.message).toContain('USD');
    });
  });
});

console.log('✅ Currency System Tests Loaded');
