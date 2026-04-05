import { jest, describe, test, expect, beforeAll } from '@jest/globals';
import Decimal from 'decimal.js';

let customerPackageService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
  }));

  await jest.unstable_mockModule('../../../../backend/services/walletService.js', () => ({
    recordLegacyTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    recordTransaction: jest.fn().mockResolvedValue({ id: 'txn-2' }),
    getWalletAccountSummary: jest.fn().mockResolvedValue({ available: 100 }),
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../../backend/services/customerPackageService.js');
    customerPackageService = mod;
  });
});

describe('customerPackageService', () => {
  describe('fetchCustomerPackagesByIds', () => {
    test('should fetch packages by IDs', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              customer_id: 'cust-1',
              total_hours: '10',
              used_hours: '3',
              remaining_hours: '7',
              purchase_price: '300',
              currency: 'EUR',
            },
          ],
        }),
      };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, [
        'p1',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
    });

    test('should return empty array when no packages found', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, [
        'nonexistent',
      ]);

      expect(result).toEqual([]);
    });

    test('should return empty array when client is null', async () => {
      const result = await customerPackageService.fetchCustomerPackagesByIds(null, ['p1']);

      expect(result).toEqual([]);
    });

    test('should return empty array when packageIds is empty', async () => {
      const mockClient = { query: jest.fn() };

      const result = await customerPackageService.fetchCustomerPackagesByIds(mockClient, []);

      expect(result).toEqual([]);
    });
  });

  describe('forceDeleteCustomerPackage', () => {
    test('should delete package and issue partial refund for unused hours', async () => {
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                customer_id: 'cust-1',
                total_hours: '10',
                used_hours: '3',
                remaining_hours: '7',
                purchase_price: '300',
                currency: 'EUR',
                package_name: 'Monthly Package',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ id: 'txn-1' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                total_hours: '10',
                used_hours: '3',
                remaining_hours: '7',
                purchase_price: '300',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
      };

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'p1',
        actorId: 'admin-1',
        issueRefund: true,
        forceFullRefund: false,
      });

      expect(result.package.id).toBe('p1');
      expect(result.refundDetails).toBeDefined();
      expect(result.cleanup).toBeDefined();
    });

    test('should throw error when client is not provided', async () => {
      await expect(
        customerPackageService.forceDeleteCustomerPackage({
          client: null,
          packageId: 'p1',
        })
      ).rejects.toThrow('Database client is required');
    });

    test('should throw 404 when package not found', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
      };

      const error = await customerPackageService
        .forceDeleteCustomerPackage({
          client: mockClient,
          packageId: 'nonexistent',
        })
        .catch((e) => e);

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('not found');
    });

    test('should skip refund if package was never paid', async () => {
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                customer_id: 'cust-1',
                total_hours: '10',
                used_hours: '0',
                remaining_hours: '10',
                purchase_price: '300',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                total_hours: '10',
                used_hours: '0',
                remaining_hours: '10',
                purchase_price: '300',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
      };

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'p1',
        issueRefund: true,
      });

      expect(result.refundDetails.refundIssued).toBe(false);
    });

    test('should issue full refund when forceFullRefund is true', async () => {
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                customer_id: 'cust-1',
                total_hours: '10',
                used_hours: '5',
                remaining_hours: '5',
                purchase_price: '300',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ id: 'txn-1' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                total_hours: '10',
                used_hours: '5',
                remaining_hours: '5',
                purchase_price: '300',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
      };

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'p1',
        issueRefund: true,
        forceFullRefund: true,
      });

      expect(result.refundDetails.refundAmount.toString()).toBe('300');
    });

    test('should check expectedCustomerId if provided', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              customer_id: 'cust-1',
              total_hours: '10',
              used_hours: '0',
              remaining_hours: '10',
              purchase_price: '300',
            },
          ],
        }),
      };

      const error = await customerPackageService
        .forceDeleteCustomerPackage({
          client: mockClient,
          packageId: 'p1',
          expectedCustomerId: 'cust-2',
        })
        .catch((e) => e);

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('does not belong');
    });

    test('should calculate partial refund based on remaining hours', async () => {
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                customer_id: 'cust-1',
                total_hours: '10',
                used_hours: '7',
                remaining_hours: '3',
                purchase_price: '100',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ id: 'txn-1' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'p1',
                total_hours: '10',
                used_hours: '7',
                remaining_hours: '3',
                purchase_price: '100',
                currency: 'EUR',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ preferred_currency: 'EUR' }] }),
      };

      const result = await customerPackageService.forceDeleteCustomerPackage({
        client: mockClient,
        packageId: 'p1',
        issueRefund: true,
      });

      expect(result.usageSummary.remainingAmount.toString()).toBe('30');
    });
  });

  describe('mapWalletTransactionForResponse', () => {
    test('should map wallet transaction with all fields', () => {
      const mockTransaction = {
        id: 'txn-1',
        user_id: 'user-1',
        balance_id: 'bal-1',
        transaction_type: 'credit',
        status: 'completed',
        direction: 'in',
        currency: 'EUR',
        amount: 100,
        available_delta: 100,
        pending_delta: 0,
        non_withdrawable_delta: 0,
        balance_available_after: 500,
        balance_pending_after: 0,
        balance_non_withdrawable_after: 0,
        description: 'Test transaction',
        related_entity_type: 'booking',
        related_entity_id: 'b1',
        created_by: 'admin-1',
        transaction_date: new Date(),
        created_at: new Date(),
        metadata: { test: true },
      };

      const result =
        customerPackageService.mapWalletTransactionForResponse(mockTransaction);

      expect(result.id).toBe('txn-1');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('EUR');
      expect(result.description).toBe('Test transaction');
    });

    test('should return null for null transaction', () => {
      const result = customerPackageService.mapWalletTransactionForResponse(null);

      expect(result).toBeNull();
    });

    test('should handle undefined numeric fields', () => {
      const mockTransaction = {
        id: 'txn-1',
        user_id: 'user-1',
        amount: null,
        available_delta: undefined,
      };

      const result =
        customerPackageService.mapWalletTransactionForResponse(mockTransaction);

      expect(result.amount).toBeNull();
      expect(result.available_delta).toBeNull();
    });
  });
});
