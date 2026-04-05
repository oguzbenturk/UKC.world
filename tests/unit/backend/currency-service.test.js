import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';

let CurrencyService;
let mockPool;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() })
  };

  mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  // Mock fetch globally for currency rate fetching
  global.fetch = jest.fn();

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger
  }));

  const mod = await import('../../../backend/services/currencyService.js');
  CurrencyService = mod.default;
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockReset();
  global.fetch.mockReset();
  mockLogger.info.mockReset();
  mockLogger.error.mockReset();
});

describe('CurrencyService.getActiveCurrencies', () => {
  test('returns all active currencies', async () => {
    const mockCurrencies = [
      {
        id: 1,
        currency_code: 'EUR',
        currency_name: 'Euro',
        symbol: '€',
        exchange_rate: '1.0000',
        is_active: true
      },
      {
        id: 2,
        currency_code: 'USD',
        currency_name: 'US Dollar',
        symbol: '$',
        exchange_rate: '1.0850',
        is_active: true
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockCurrencies });

    const result = await CurrencyService.getActiveCurrencies();

    expect(result).toEqual(mockCurrencies);
    expect(mockPool.query).toHaveBeenCalled();
  });

  test('orders currencies by base currency first, then name', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await CurrencyService.getActiveCurrencies();

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('ORDER BY');
    expect(query).toContain('DESC');
  });
});

describe('CurrencyService.getAllCurrencies', () => {
  test('returns both active and inactive currencies', async () => {
    const mockCurrencies = [
      {
        currency_code: 'EUR',
        is_active: true
      },
      {
        currency_code: 'AUD',
        is_active: false
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockCurrencies });

    const result = await CurrencyService.getAllCurrencies();

    expect(result).toHaveLength(2);
    expect(result.some(c => c.is_active === false)).toBe(true);
  });
});

describe('CurrencyService.getBaseCurrency', () => {
  test('returns base currency', async () => {
    const baseCurrency = {
      id: 1,
      currency_code: 'EUR',
      currency_name: 'Euro',
      base_currency: true,
      exchange_rate: '1.0000'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [baseCurrency] });

    const result = await CurrencyService.getBaseCurrency();

    expect(result.base_currency).toBe(true);
    expect(result.exchange_rate).toBe('1.0000');
  });

  test('returns null when no base currency found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await CurrencyService.getBaseCurrency();

    expect(result).toBe(null);
  });
});

describe('CurrencyService.convertCurrency', () => {
  test('returns same amount when currencies match', async () => {
    const result = await CurrencyService.convertCurrency(100, 'EUR', 'EUR');

    expect(result).toBe(100);
  });

  test('converts amount between two currencies', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0' }]
      }) // EUR rate (base)
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0850' }]
      }); // USD rate

    const result = await CurrencyService.convertCurrency(100, 'EUR', 'USD');

    expect(result).toBe(108.50);
  });

  test('converts via base currency for non-base source', async () => {
    // 100 USD to GBP (both non-EUR)
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0850' }]
      }) // USD rate
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '0.8765' }]
      }); // GBP rate

    const result = await CurrencyService.convertCurrency(100, 'USD', 'GBP');

    // 100 / 1.0850 = 92.16 EUR * 0.8765 = 80.76
    expect(result).toBeCloseTo(80.76, 1);
  });

  test('throws error when currency not found', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // fromRate not found
      .mockResolvedValueOnce({ rows: [] }); // toRate not found

    await expect(
      CurrencyService.convertCurrency(100, 'INVALID', 'EUR')
    ).rejects.toThrow('Currency not found');
  });

  test('returns decimal places of 2', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0' }]
      })
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '3.333333' }]
      });

    const result = await CurrencyService.convertCurrency(10, 'EUR', 'INR');

    expect(result.toString().split('.')[1].length).toBeLessThanOrEqual(2);
  });
});

describe('CurrencyService.convertToTRY', () => {
  test('returns amount as-is when already TRY', async () => {
    const result = await CurrencyService.convertToTRY(100, 'TRY');

    expect(result.amount).toBe(100);
    expect(result.rate).toBe(1.0);
  });

  test('converts EUR to TRY', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.70' }]
    }); // TRY rate

    const result = await CurrencyService.convertToTRY(100, 'EUR');

    expect(result.amount).toBe(5170);
    expect(result.rate).toBe(51.70);
  });

  test('converts USD to TRY via EUR base', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '51.70' }]
      }) // TRY rate
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0850' }]
      }); // USD rate

    const result = await CurrencyService.convertToTRY(100, 'USD');

    // 100 / 1.0850 = 92.16 EUR * 51.70 = 4764.98
    expect(result.amount).toBeCloseTo(4764.98, 0);
  });

  test('throws error when TRY rate not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      CurrencyService.convertToTRY(100, 'EUR')
    ).rejects.toThrow('TRY exchange rate not found');
  });

  test('throws error when source currency not found', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '51.70' }]
      })
      .mockResolvedValueOnce({
        rows: [] // USD not found
      });

    await expect(
      CurrencyService.convertToTRY(100, 'USD')
    ).rejects.toThrow('Exchange rate not found');
  });

  test('handles case-insensitive currency codes', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.70' }]
    });

    const result = await CurrencyService.convertToTRY(100, 'eur');

    expect(result.amount).toBe(5170);
  });

  test('returns decimal precision for TRY amount', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.7033' }]
    });

    const result = await CurrencyService.convertToTRY(100, 'EUR');

    expect(result.amount.toString().split('.')[1].length).toBeLessThanOrEqual(2);
  });
});

describe('CurrencyService.getExchangeRate', () => {
  test('returns exchange rate for currency', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '1.0850' }]
    });

    const result = await CurrencyService.getExchangeRate('USD');

    expect(result).toBe(1.0850);
  });

  test('handles case-insensitive currency codes', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '1.0850' }]
    });

    const result = await CurrencyService.getExchangeRate('usd');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['USD']
    );
  });

  test('throws error when currency not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      CurrencyService.getExchangeRate('INVALID')
    ).rejects.toThrow('Exchange rate not found');
  });
});

describe('CurrencyService.updateExchangeRate', () => {
  test('updates exchange rate', async () => {
    const updated = {
      currency_code: 'USD',
      exchange_rate: '1.0900'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updated] });

    const result = await CurrencyService.updateExchangeRate('USD', 1.0900);

    expect(result.exchange_rate).toBe('1.0900');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE currency_settings'),
      [1.0900, 'USD']
    );
  });
});

describe('CurrencyService.addCurrency', () => {
  test('adds new currency', async () => {
    const newCurrency = {
      id: 5,
      currency_code: 'JPY',
      currency_name: 'Japanese Yen',
      symbol: '¥',
      exchange_rate: '120.50',
      is_active: true
    };

    mockPool.query.mockResolvedValueOnce({ rows: [newCurrency] });

    const result = await CurrencyService.addCurrency({
      currency_code: 'JPY',
      currency_name: 'Japanese Yen',
      symbol: '¥',
      exchange_rate: 120.50
    });

    expect(result.currency_code).toBe('JPY');
  });

  test('defaults is_active to true', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ is_active: true }]
    });

    await CurrencyService.addCurrency({
      currency_code: 'AUD',
      currency_name: 'Australian Dollar',
      symbol: 'A$',
      exchange_rate: 1.5
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      [
        'AUD',
        'Australian Dollar',
        'A$',
        1.5,
        true
      ]
    );
  });
});

describe('CurrencyService.toggleCurrencyStatus', () => {
  test('toggles currency active status', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ currency_code: 'AUD', is_active: false }]
    });

    const result = await CurrencyService.toggleCurrencyStatus('AUD', false);

    expect(result.is_active).toBe(false);
  });
});

describe('CurrencyService.setBaseCurrency', () => {
  test('sets new base currency and removes from others', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newBase = {
      currency_code: 'USD',
      base_currency: true,
      exchange_rate: '1.0000'
    };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // unset old base
      .mockResolvedValueOnce({ rows: [newBase] }) // set new base
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await CurrencyService.setBaseCurrency('USD');

    expect(result.base_currency).toBe(true);
    expect(result.exchange_rate).toBe('1.0000');
    expect(client.release).toHaveBeenCalled();
  });

  test('sets new base rate to 1.0000', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ exchange_rate: '1.0000' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await CurrencyService.setBaseCurrency('GBP');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('exchange_rate = 1.0000'),
      expect.any(Array)
    );
  });

  test('releases client on error', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      CurrencyService.setBaseCurrency('USD')
    ).rejects.toThrow();

    expect(client.release).toHaveBeenCalled();
  });
});

describe('CurrencyService.formatCurrency', () => {
  test('formats currency with symbol', () => {
    const result = CurrencyService.formatCurrency(1234.56, 'USD', '$');

    expect(result).toBe('$1,234.56');
  });

  test('formats currency without symbol', () => {
    const result = CurrencyService.formatCurrency(1234.56, 'EUR');

    expect(result).toContain('1,234.56');
    expect(result).toContain('EUR');
  });

  test('adds thousand separators', () => {
    const result = CurrencyService.formatCurrency(1000000, 'USD', '$');

    expect(result).toContain(',');
  });

  test('always shows 2 decimal places', () => {
    const result1 = CurrencyService.formatCurrency(100, 'USD', '$');
    const result2 = CurrencyService.formatCurrency(100.5, 'USD', '$');

    expect(result1).toMatch(/\.\d{2}$/);
    expect(result2).toMatch(/\.\d{2}$/);
  });

  test('handles null amount as 0', () => {
    const result = CurrencyService.formatCurrency(null, 'USD', '$');

    expect(result).toContain('0.00');
  });
});

describe('CurrencyService.getCurrencySymbol', () => {
  test('returns currency symbol', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ symbol: '$' }]
    });

    const result = await CurrencyService.getCurrencySymbol('USD');

    expect(result).toBe('$');
  });

  test('returns currency code when symbol not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await CurrencyService.getCurrencySymbol('INVALID');

    expect(result).toBe('INVALID');
  });

  test('returns currency code on error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const result = await CurrencyService.getCurrencySymbol('USD');

    expect(result).toBe('USD');
  });
});

describe('CurrencyService.fetchGoogleRate', () => {
  test('returns 1.0 when fetching base currency rate', async () => {
    const result = await CurrencyService.fetchGoogleRate('EUR', 'EUR');

    expect(result).toBe(1.0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fetches rate from first available source', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        rates: { USD: 1.0850 }
      })
    });

    const result = await CurrencyService.fetchGoogleRate('USD', 'EUR');

    expect(result).toBe(1.0850);
  });

  test('returns null when all sources fail', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await CurrencyService.fetchGoogleRate('INVALID', 'EUR');

    expect(result).toBe(null);
  });

  test('tries fallback sources on failure', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('First failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          rates: { USD: 1.0850 }
        })
      });

    const result = await CurrencyService.fetchGoogleRate('USD', 'EUR');

    expect(result).toBe(1.0850);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('CurrencyService.convertToTRY - financial edge cases', () => {
  test('handles zero amount', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.70' }]
    });

    const result = await CurrencyService.convertToTRY(0, 'EUR');

    expect(result.amount).toBe(0);
  });

  test('handles small decimal amounts (0.1 + 0.2 precision)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.70' }]
    });

    // 0.3 EUR to TRY should be exactly 15.51, not floating point errors
    const result = await CurrencyService.convertToTRY(0.3, 'EUR');

    expect(result.amount).toBe(15.51);
  });

  test('handles large amounts without precision loss', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ exchange_rate: '51.70' }]
    });

    const result = await CurrencyService.convertToTRY(999999.99, 'EUR');

    // Should not lose precision with Decimal.js
    expect(typeof result.amount).toBe('number');
    expect(isNaN(result.amount)).toBe(false);
  });
});

describe('CurrencyService.getCurrenciesDueForUpdate', () => {
  test('returns currencies needing update', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          currency_code: 'USD',
          auto_update_enabled: true,
          last_updated_at: null
        }
      ]
    });

    const result = await CurrencyService.getCurrenciesDueForUpdate();

    expect(result).toHaveLength(1);
    expect(result[0].currency_code).toBe('USD');
  });

  test('excludes base currency from update list', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: []
    });

    await CurrencyService.getCurrenciesDueForUpdate();

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('base_currency = false');
  });
});
