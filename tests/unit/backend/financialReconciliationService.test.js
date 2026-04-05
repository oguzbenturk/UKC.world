import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let reconciliationService;
let pool;
let logger;
let appendCreatedBy;
let resolveSystemActorId;

beforeAll(async () => {
  // Setup ESM mocks before importing the service
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: { query: jest.fn(), connect: jest.fn() },
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../backend/utils/auditUtils.js', () => ({
    appendCreatedBy: jest.fn(),
    resolveSystemActorId: jest.fn(),
  }));

  // Import the service after mocks are set up
  const serviceModule = await import('../../../backend/services/financialReconciliationService.js');
  reconciliationService = serviceModule.reconciliationService;

  const dbModule = await import('../../../backend/db.js');
  pool = dbModule.pool;

  const loggerModule = await import('../../../backend/middlewares/errorHandler.js');
  logger = loggerModule.logger;

  const auditModule = await import('../../../backend/utils/auditUtils.js');
  appendCreatedBy = auditModule.appendCreatedBy;
  resolveSystemActorId = auditModule.resolveSystemActorId;
});

describe('FinancialReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset service state
    reconciliationService.isRunning = false;
    reconciliationService.lastRun = null;
    reconciliationService.stats = {
      totalChecks: 0,
      discrepanciesFound: 0,
      discrepanciesFixed: 0,
      errors: 0,
    };

    logger.info.mockReturnValue(undefined);
    logger.warn.mockReturnValue(undefined);
    logger.error.mockReturnValue(undefined);
    appendCreatedBy.mockReturnValue({ columns: [], values: [] });
    resolveSystemActorId.mockReturnValue('system-actor');
  });

  describe('parseNumber', () => {
    test('parses valid numbers', () => {
      expect(reconciliationService.parseNumber('100')).toBe(100);
      expect(reconciliationService.parseNumber(100)).toBe(100);
      expect(reconciliationService.parseNumber('99.99')).toBe(99.99);
    });

    test('returns 0 for invalid numbers', () => {
      expect(reconciliationService.parseNumber('abc')).toBe(0);
      expect(reconciliationService.parseNumber(NaN)).toBe(0);
      expect(reconciliationService.parseNumber(Infinity)).toBe(0);
      expect(reconciliationService.parseNumber(null)).toBe(0);
    });

    test('handles zero', () => {
      expect(reconciliationService.parseNumber(0)).toBe(0);
      expect(reconciliationService.parseNumber('0')).toBe(0);
    });

    test('handles negative numbers', () => {
      expect(reconciliationService.parseNumber('-100')).toBe(-100);
      expect(reconciliationService.parseNumber(-50.5)).toBe(-50.5);
    });
  });

  describe('roundCurrency', () => {
    test('rounds to 2 decimal places', () => {
      expect(reconciliationService.roundCurrency('100.555')).toBe(100.56);
      expect(reconciliationService.roundCurrency('99.991')).toBe(99.99);
    });

    test('handles exact amounts', () => {
      expect(reconciliationService.roundCurrency('100.00')).toBe(100);
      expect(reconciliationService.roundCurrency(50)).toBe(50);
    });

    test('handles invalid values', () => {
      expect(reconciliationService.roundCurrency('abc')).toBe(0);
      expect(reconciliationService.roundCurrency(NaN)).toBe(0);
    });

    test('fixes floating point errors', () => {
      expect(reconciliationService.roundCurrency(0.1 + 0.2)).toBe(0.30);
    });
  });

  describe('parseDateSafe', () => {
    test('parses valid date strings', () => {
      const result = reconciliationService.parseDateSafe('2026-04-04');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
    });

    test('handles Date objects', () => {
      const date = new Date('2026-04-04');
      const result = reconciliationService.parseDateSafe(date);
      expect(result).toEqual(date);
    });

    test('returns null for invalid dates', () => {
      expect(reconciliationService.parseDateSafe('invalid')).toBeNull();
      expect(reconciliationService.parseDateSafe(new Date('invalid'))).toBeNull();
    });

    test('returns null for null/undefined', () => {
      expect(reconciliationService.parseDateSafe(null)).toBeNull();
      expect(reconciliationService.parseDateSafe(undefined)).toBeNull();
    });
  });

  describe('calculateUserFinancials', () => {
    test('calculates balance from transactions', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
        {
          id: 2,
          amount: 50,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-02'),
          created_at: new Date('2026-04-02'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.balance).toBe(150);
      expect(result.transactionCount).toBe(2);
    });

    test('calculates total spent from payment transactions', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.totalSpent).toBe(100);
    });

    test('handles credit transactions', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: 50,
          type: 'credit',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.totalSpent).toBe(50);
      expect(result.balance).toBe(50);
    });

    test('handles refund transactions', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'refund',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.balance).toBe(100);
    });

    test('sets lastPaymentAt when credit transactions exist', async () => {
      const date1 = new Date('2026-04-01');

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'credit',
          status: 'completed',
          transaction_date: date1,
          created_at: date1,
          description: 'Credit',
          payment_method: 'card',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      // Credit transactions with non-zero amount set lastPaymentAt
      expect(result.lastPaymentAt).toBeDefined();
      expect(result.balance).toBe(100);
    });

    test('rounds currency values to 2 decimals', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: 100.555,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.balance).toBe(100.56);
    });

    test('handles empty transaction list', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.balance).toBe(0);
      expect(result.totalSpent).toBe(0);
      expect(result.lastPaymentAt).toBeNull();
      expect(result.transactionCount).toBe(0);
    });

    test('ignores negative amounts for charge transactions', async () => {
      const mockTransactions = [
        {
          id: 1,
          amount: -50,
          type: 'charge',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.calculateUserFinancials(1);

      expect(result.balance).toBe(-50);
      expect(result.totalSpent).toBe(0);
    });
  });

  describe('checkAndFixUser', () => {
    test('detects balance discrepancy', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        stored_balance: 100,
        stored_total_spent: 50,
        has_account: true,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 150,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      pool.connect = jest.fn().mockResolvedValue(mockClient);

      const result = await reconciliationService.checkAndFixUser(user);

      expect(result.discrepancy).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('does not fix when within tolerance', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        stored_balance: 100.00,
        stored_total_spent: 100.00,
        has_account: true,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.checkAndFixUser(user);

      expect(result.discrepancy).toBe(false);
      expect(result.fixed).toBe(false);
    });

    test('creates new account if missing', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        stored_balance: 0,
        stored_total_spent: 0,
        has_account: false,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      pool.connect = jest.fn().mockResolvedValue(mockClient);
      appendCreatedBy.mockReturnValue({
        columns: ['user_id', 'balance', 'total_spent', 'last_payment_date', 'created_by'],
        values: [1, 100, 0, expect.any(Date), 'system-actor'],
      });

      const result = await reconciliationService.checkAndFixUser(user);

      expect(result.discrepancy).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    });

    test('handles database error gracefully', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        stored_balance: 100,
        stored_total_spent: 50,
        has_account: true,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 200,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockTransactions });
      pool.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await reconciliationService.checkAndFixUser(user);

      expect(result.error).toBeDefined();
      expect(reconciliationService.stats.errors).toBe(1);
    });

    test('updates existing account if discrepancy found', async () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        stored_balance: 50,
        stored_total_spent: 25,
        has_account: true,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 150,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      pool.connect = jest.fn().mockResolvedValue(mockClient);

      await reconciliationService.checkAndFixUser(user);

      const updateCall = mockClient.query.mock.calls.find(
        call => call[0].includes('UPDATE student_accounts')
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe('runReconciliation', () => {
    test('prevents concurrent runs', async () => {
      reconciliationService.isRunning = true;
      pool.query.mockResolvedValue({ rows: [] });

      await reconciliationService.runReconciliation();

      expect(logger.warn).toHaveBeenCalledWith(
        'Financial reconciliation already running, skipping'
      );
    });

    test('processes all users with transactions', async () => {
      const mockUsers = [
        {
          id: 1,
          name: 'User 1',
          email: 'user1@example.com',
          has_account: true,
          stored_balance: 100,
          stored_total_spent: 50,
          transaction_count: 1,
        },
        {
          id: 2,
          name: 'User 2',
          email: 'user2@example.com',
          has_account: true,
          stored_balance: 200,
          stored_total_spent: 100,
          transaction_count: 2,
        },
      ];

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockUsers }).mockResolvedValue({ rows: mockTransactions });

      const result = await reconciliationService.runReconciliation();

      expect(result.usersChecked).toBe(2);
      expect(result.success).toBe(true);
    });

    test('sets isRunning and lastRun', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await reconciliationService.runReconciliation();

      expect(reconciliationService.isRunning).toBe(false);
      expect(reconciliationService.lastRun).toBeInstanceOf(Date);
    });

    test('respects limit option', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await reconciliationService.runReconciliation({ limit: 10 });

      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain('LIMIT');
    });

    test('handles database error', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      await expect(reconciliationService.runReconciliation())
        .rejects.toThrow('DB error');

      expect(reconciliationService.isRunning).toBe(false);
    });

    test('tracks statistics', async () => {
      const mockUsers = [
        {
          id: 1,
          name: 'User 1',
          email: 'user1@example.com',
          has_account: true,
          stored_balance: 0,
          stored_total_spent: 0,
          transaction_count: 1,
        },
      ];

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockUsers }).mockResolvedValue({ rows: mockTransactions });

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      pool.connect = jest.fn().mockResolvedValue(mockClient);

      const result = await reconciliationService.runReconciliation();

      expect(result.usersChecked).toBeGreaterThan(0);
      expect(result.duration).toBeDefined();
    });
  });

  describe('onTransactionChange', () => {
    test('checks and fixes user after transaction', async () => {
      const mockUser = {
        id: 1,
        name: 'User 1',
        email: 'user1@example.com',
        has_account: true,
        stored_balance: 100,
        stored_total_spent: 50,
      };

      const mockTransactions = [
        {
          id: 1,
          amount: 100,
          type: 'payment',
          status: 'completed',
          transaction_date: new Date('2026-04-01'),
          created_at: new Date('2026-04-01'),
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: [mockUser] }).mockResolvedValue({ rows: mockTransactions });

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      pool.connect = jest.fn().mockResolvedValue(mockClient);

      await reconciliationService.onTransactionChange(1, { amount: 100 });

      expect(logger.info).toHaveBeenCalledWith(
        'Transaction change detected, triggering reconciliation',
        expect.any(Object)
      );
    });

    test('handles missing user gracefully', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await reconciliationService.onTransactionChange(999);

      expect(logger.info).toHaveBeenCalled();
    });

    test('handles errors gracefully', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      await reconciliationService.onTransactionChange(1);

      expect(logger.error).toHaveBeenCalledWith(
        'Transaction-triggered reconciliation failed',
        expect.any(Object)
      );
    });
  });

  describe('getStats', () => {
    test('returns current statistics', () => {
      reconciliationService.stats.totalChecks = 5;
      reconciliationService.stats.discrepanciesFound = 2;
      reconciliationService.isRunning = false;

      const stats = reconciliationService.getStats();

      expect(stats.totalChecks).toBe(5);
      expect(stats.discrepanciesFound).toBe(2);
      expect(stats.isRunning).toBe(false);
      expect(stats.lastRun).toBeNull();
    });

    test('includes service state', () => {
      reconciliationService.isRunning = true;
      reconciliationService.lastRun = new Date();

      const stats = reconciliationService.getStats();

      expect(stats.isRunning).toBe(true);
      expect(stats.lastRun).toBeInstanceOf(Date);
    });
  });
});
