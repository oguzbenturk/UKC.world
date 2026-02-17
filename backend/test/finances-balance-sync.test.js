import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockQuery = jest.fn();
const mockWalletSummary = jest.fn();

await jest.unstable_mockModule('../db.js', () => ({
  pool: {
    query: mockQuery
  }
}));

await jest.unstable_mockModule('../services/walletService.js', () => ({
  getWalletAccountSummary: mockWalletSummary,
  recordTransaction: jest.fn(),
  recordLegacyTransaction: jest.fn(),
  fetchTransactions: jest.fn(),
  getTransactionById: jest.fn()
}));

await jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const {
  __testables: { calculateUserBalance }
} = await import('../routes/finances.js');

describe('calculateUserBalance wallet alignment', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockWalletSummary.mockReset();
  });

  test('returns wallet summary values when available', async () => {
    const walletData = {
      balanceId: 'balance-1',
      available: 750,
      totalSpent: 190,
      totalCredits: 900,
      totalDebits: 190,
      pending: 0,
      nonWithdrawable: 0,
      currency: 'EUR'
    };
    mockWalletSummary.mockResolvedValue(walletData);

    const result = await calculateUserBalance('user-1');

    expect(result).toEqual({ balance: 750, totalSpent: 190, walletSummary: walletData });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('returns zero balance when no wallet data', async () => {
    mockWalletSummary.mockResolvedValue(null);

    const result = await calculateUserBalance('user-2');

    expect(result).toEqual({ balance: 0, totalSpent: 0, walletSummary: null });
    // Function no longer falls back to transaction rollup - it just returns zeros
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('returns wallet summary data even when balanceId is null', async () => {
    const walletData = {
      balanceId: null,
      available: 0,
      totalSpent: 0,
      totalCredits: 0,
      totalDebits: 0,
      pending: 0,
      nonWithdrawable: 0,
      currency: 'EUR'
    };
    mockWalletSummary.mockResolvedValue(walletData);

    const result = await calculateUserBalance('user-3');

    // Function now returns wallet summary as-is, no longer falls back to transactions
    expect(mockQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ balance: 0, totalSpent: 0, walletSummary: walletData });
  });
});
