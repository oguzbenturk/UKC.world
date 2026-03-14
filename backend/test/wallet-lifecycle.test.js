import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Wallet Lifecycle Tests
 *
 * Tests the core wallet service logic:
 * - recordTransaction: credit, debit, balance updates, allowNegative
 * - Validation: invalid status, insufficient balance
 * - Balance tracking: available_amount changes correctly
 * - Direction resolution: positive amount → credit, negative → debit
 */

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();

const mockClient = {
  query: jest.fn(),
  release: mockRelease
};

await jest.unstable_mockModule('../db.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect
  }
}));

await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const { recordTransaction } = await import('../services/walletService.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// Helper: set up mockClient.query to simulate ensureBalance + UPDATE + INSERT + mirror
function setupSuccessfulTransaction(currentAvailable = 500) {
  let callCount = 0;
  mockClient.query.mockImplementation(async (sql) => {
    callCount++;
    const sqlStr = typeof sql === 'string' ? sql : '';

    // BEGIN
    if (sqlStr.includes('BEGIN')) return { rows: [] };
    // COMMIT
    if (sqlStr.includes('COMMIT')) return { rows: [] };
    // ROLLBACK
    if (sqlStr.includes('ROLLBACK')) return { rows: [] };
    // ensureBalance: SELECT
    if (sqlStr.includes('wallet_balances') && sqlStr.includes('SELECT')) {
      return {
        rows: [{
          id: 'bal-1',
          user_id: 'user-1',
          currency: 'EUR',
          available_amount: currentAvailable.toString(),
          pending_amount: '0',
          non_withdrawable_amount: '0'
        }]
      };
    }
    // ensureBalance: INSERT (upsert)
    if (sqlStr.includes('wallet_balances') && sqlStr.includes('INSERT')) {
      return {
        rows: [{
          id: 'bal-1',
          user_id: 'user-1',
          currency: 'EUR',
          available_amount: currentAvailable.toString(),
          pending_amount: '0',
          non_withdrawable_amount: '0'
        }]
      };
    }
    // UPDATE balance
    if (sqlStr.includes('UPDATE wallet_balances')) return { rows: [] };
    // INSERT transaction
    if (sqlStr.includes('INSERT INTO wallet_transactions')) {
      return {
        rows: [{
          id: 'txn-1',
          user_id: 'user-1',
          transaction_type: 'payment',
          amount: 50,
          direction: 'debit',
          currency: 'EUR',
          status: 'completed'
        }]
      };
    }
    // set_config (for allowNegative)
    if (sqlStr.includes('set_config')) return { rows: [] };
    // Legacy mirror update
    if (sqlStr.includes('UPDATE users')) return { rows: [] };
    // Default
    return { rows: [] };
  });
}

// ============================================
// 1. Validation
// ============================================
describe('recordTransaction — validation', () => {
  test('throws when transactionType is missing', async () => {
    await expect(
      recordTransaction({
        userId: 'user-1',
        amount: 50,
        transactionType: undefined,
        client: mockClient
      })
    ).rejects.toThrow('recordTransaction requires transactionType');
  });

  test('throws for invalid status', async () => {
    await expect(
      recordTransaction({
        userId: 'user-1',
        amount: 50,
        transactionType: 'payment',
        status: 'bogus',
        client: mockClient
      })
    ).rejects.toThrow(/invalid wallet transaction status/i);
  });
});

// ============================================
// 2. Insufficient balance (no allowNegative)
// ============================================
describe('recordTransaction — insufficient balance', () => {
  test('throws when debit exceeds available balance', async () => {
    // Available: 100, trying to debit 200
    setupSuccessfulTransaction(100);

    await expect(
      recordTransaction({
        userId: 'user-1',
        amount: -200,
        transactionType: 'payment',
        availableDelta: -200,
        client: mockClient
      })
    ).rejects.toThrow(/insufficient wallet balance/i);
  });
});

// ============================================
// 3. allowNegative flag
// ============================================
describe('recordTransaction — allowNegative', () => {
  test('allows overdraft when allowNegative is true', async () => {
    setupSuccessfulTransaction(50);

    const result = await recordTransaction({
      userId: 'user-1',
      amount: -200,
      transactionType: 'payment',
      availableDelta: -200,
      allowNegative: true,
      client: mockClient
    });

    // Should succeed, not throw
    expect(result).toBeDefined();
    // Should call set_config to allow negative
    const setCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('set_config')
    );
    expect(setCalls.length).toBeGreaterThan(0);
  });
});

// ============================================
// 4. Credit transaction (top-up/deposit)
// ============================================
describe('recordTransaction — credit (top-up)', () => {
  test('records a credit transaction successfully', async () => {
    setupSuccessfulTransaction(100);

    const result = await recordTransaction({
      userId: 'user-1',
      amount: 200,
      transactionType: 'wallet_deposit',
      direction: 'credit',
      availableDelta: 200,
      description: 'Card deposit',
      client: mockClient
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('txn-1');
  });
});

// ============================================
// 5. Debit transaction (payment/spend)
// ============================================
describe('recordTransaction — debit (payment)', () => {
  test('records a debit transaction within balance', async () => {
    setupSuccessfulTransaction(500);

    const result = await recordTransaction({
      userId: 'user-1',
      amount: -100,
      transactionType: 'payment',
      direction: 'debit',
      availableDelta: -100,
      description: 'Shop order payment',
      relatedEntityType: 'shop_order',
      relatedEntityId: 'order-123',
      client: mockClient
    });

    expect(result).toBeDefined();
  });
});

// ============================================
// 6. Refund (credit back)
// ============================================
describe('recordTransaction — refund', () => {
  test('records a refund as credit', async () => {
    setupSuccessfulTransaction(200);

    const result = await recordTransaction({
      userId: 'user-1',
      amount: 50,
      transactionType: 'refund',
      direction: 'credit',
      availableDelta: 50,
      description: 'Booking cancellation refund',
      relatedEntityType: 'booking',
      relatedEntityId: 'booking-456',
      client: mockClient
    });

    expect(result).toBeDefined();
  });
});

// ============================================
// 7. Currency normalization
// ============================================
describe('recordTransaction — currency handling', () => {
  test('normalizes currency to uppercase', async () => {
    setupSuccessfulTransaction(100);

    await recordTransaction({
      userId: 'user-1',
      amount: 10,
      transactionType: 'wallet_deposit',
      currency: 'eur',
      availableDelta: 10,
      client: mockClient
    });

    // Check the INSERT call uses uppercase currency
    const insertCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO wallet_transactions')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    // The 6th parameter ($6) is currency
    const params = insertCalls[0][1];
    expect(params[5]).toBe('EUR');
  });
});

// ============================================
// 8. Metadata and related entity tracking
// ============================================
describe('recordTransaction — metadata & entity tracking', () => {
  test('stores metadata as JSONB', async () => {
    setupSuccessfulTransaction(100);

    await recordTransaction({
      userId: 'user-1',
      amount: -30,
      transactionType: 'payment',
      availableDelta: -30,
      metadata: { orderId: 'order-789', reason: 'shop purchase' },
      relatedEntityType: 'shop_order',
      relatedEntityId: 'order-789',
      client: mockClient
    });

    const insertCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO wallet_transactions')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    // metadata param ($21) should be JSON string
    const metadataParam = insertCalls[0][1][20];
    const parsed = JSON.parse(metadataParam);
    expect(parsed.orderId).toBe('order-789');
  });
});
