// Unit tests for walletService
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database pool
vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../db.js';
import { 
  getBalance, 
  recordTransaction,
  fetchTransactions,
  getWalletAccountSummary 
} from '../walletService.js';

describe('walletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should return user balance', async () => {
      const mockUserId = 'user-123';
      const mockBalance = { available: 1000, pending: 50, non_withdrawable: 100 };

      pool.query.mockResolvedValueOnce({
        rows: [mockBalance]
      });

      const result = await getBalance(mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [mockUserId]
      );
      expect(result).toEqual(mockBalance);
    });

    it('should return zero balance for new users', async () => {
      pool.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await getBalance('new-user');

      expect(result).toEqual({
        available: 0,
        pending: 0,
        non_withdrawable: 0
      });
    });
  });

  describe('recordTransaction', () => {
    it('should record a payment transaction', async () => {
      const mockTransaction = {
        user_id: 'user-123',
        amount: 100,
        transaction_type: 'payment',
        description: 'Test payment',
        status: 'completed'
      };

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'txn-123', ...mockTransaction }]
      });

      const result = await recordTransaction(mockTransaction);

      expect(pool.query).toHaveBeenCalled();
      expect(result.id).toBe('txn-123');
    });

    it('should handle transaction errors', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        recordTransaction({ user_id: 'user-123', amount: 100 })
      ).rejects.toThrow('Database error');
    });
  });

  describe('getWalletAccountSummary', () => {
    it('should return wallet summary with all fields', async () => {
      const mockSummary = {
        available: 1000,
        pending: 50,
        nonWithdrawable: 200
      };

      pool.query.mockResolvedValueOnce({
        rows: [mockSummary]
      });

      const result = await getWalletAccountSummary('user-123');

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('nonWithdrawable');
    });
  });
});
